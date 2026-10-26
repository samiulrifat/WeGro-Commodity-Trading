import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ContractTransaction,
  FeeData,
  TransactionReceipt,
  TransactionRequest,
} from 'ethers';
import type { EnvironmentVariables } from '../../config/env.validation';
import {
  type ContractName,
  ContractsRegistry,
  type PlatformContracts,
} from '../contracts.registry';
import { ContractErrorDecoder } from '../errors/contract-errors';
import { KeyService } from '../keys/key.service';
import { eventArgs } from '../utils/event-args';

export interface DecodedEvent {
  contract: ContractName;
  name: string;
  args: Record<string, unknown>;
  logIndex: number;
}

export interface TxResult {
  hash: string;
  blockNumber: number;
  /** The block's timestamp: the time the ledger itself records for these events. */
  blockTime: Date;
  gasUsed: bigint;
  /** The sending key's address: whose action this was. */
  from: string;
  /** Platform contract events emitted by this transaction, in log order. */
  events: DecodedEvent[];
}

/** Gas estimate plus 20%: covers small state changes between estimate and mining. */
const GAS_BUFFER_PERCENT = 120n;
const FEE_CACHE_MS = 2000;

/**
 * Sends transactions as a person's key.
 *
 * Each call is simulated first (gas estimation), so a call the contracts
 * would reject fails with a decoded error before any nonce is used. Nonces are
 * tracked in memory per key: one RPC on a key's first transaction, none after.
 * Only nonce assignment and broadcast are serialised per key; simulation and
 * waiting for the receipt run concurrently, so independent requests pipeline.
 */
@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);
  readonly decoder: ContractErrorDecoder;

  /** Tail of each key's send queue; removed when the queue drains. */
  private readonly queues = new Map<string, Promise<unknown>>();
  /** Next nonce per key; dropped on any send failure so it is re-read. */
  private readonly nonces = new Map<string, number>();
  private feeCache?: { at: number; data: Promise<FeeData> };

  private readonly confirmations: number;
  private readonly timeoutMs: number;
  private readonly fundingWei: bigint;

  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    private readonly registry: ContractsRegistry,
    private readonly keys: KeyService,
  ) {
    this.decoder = new ContractErrorDecoder(registry.all().map((c) => c.iface));
    this.confirmations = config.get('TX_CONFIRMATIONS', { infer: true });
    this.timeoutMs = config.get('TX_TIMEOUT_MS', { infer: true });
    this.fundingWei = BigInt(config.get('KEY_FUNDING_WEI', { infer: true }));
  }

  /**
   * Sends one contract call as the key at `signerIndex` and waits for it to
   * be mined. `build` encodes the call, typed against the contract:
   *
   *   tx.send(key, 'ProjectLedger', (c) => c.reserveSlots.populateTransaction(id, 4))
   *
   * Rejections come back as ContractRevertException (4xx with the contract's
   * error name and arguments); an unreachable node as 503.
   */
  async send<N extends ContractName>(
    signerIndex: number,
    contract: N,
    build: (c: PlatformContracts[N]) => Promise<ContractTransaction>,
  ): Promise<TxResult> {
    try {
      const call = await build(this.registry.get(contract));
      return await this.execute(signerIndex, call, true);
    } catch (error) {
      throw this.toHttp(error);
    }
  }

  /**
   * Tops up `address` from the operator key so it can pay fees. No-op when
   * funding is disabled (KEY_FUNDING_WEI=0, e.g. Besu with free gas) or the
   * balance is already at least half the funding amount.
   */
  async ensureFunded(address: string): Promise<boolean> {
    if (this.fundingWei === 0n) return false;
    const balance = await this.registry.provider.getBalance(address);
    if (balance * 2n >= this.fundingWei) return false;
    try {
      await this.execute(
        KeyService.OPERATOR_INDEX,
        { to: address, value: this.fundingWei - balance },
        false,
      );
    } catch (error) {
      throw this.toHttp(error);
    }
    return true;
  }

  private async execute(
    signerIndex: number,
    call: TransactionRequest,
    canFund: boolean,
  ): Promise<TxResult> {
    const wallet = this.keys.signerFor(signerIndex);
    const request: TransactionRequest = { ...call, from: wallet.address };

    // Simulation: reverts surface here, decoded, before a nonce is spent.
    const [gas, fees] = await Promise.all([
      this.registry.provider.estimateGas(request),
      this.feeData(),
    ]);
    request.gasLimit = (gas * GAS_BUFFER_PERCENT) / 100n;
    if (fees.maxFeePerGas !== null && fees.maxPriorityFeePerGas !== null) {
      request.maxFeePerGas = fees.maxFeePerGas;
      request.maxPriorityFeePerGas = fees.maxPriorityFeePerGas;
    } else {
      request.gasPrice = fees.gasPrice ?? 0n;
    }
    request.chainId = this.registry.chainId;

    let response;
    try {
      response = await this.enqueue(wallet.address, async () => {
        const nonce = await this.nextNonce(wallet.address);
        const sent = await wallet.sendTransaction({ ...request, nonce });
        this.nonces.set(wallet.address, nonce + 1);
        return sent;
      });
    } catch (error) {
      if (canFund && isInsufficientFunds(error) && this.fundingWei > 0n) {
        this.logger.log(`Funding ${wallet.address} and retrying`);
        await this.ensureFunded(wallet.address);
        return this.execute(signerIndex, call, false);
      }
      throw error;
    }

    let receipt: TransactionReceipt | null;
    try {
      receipt = await response.wait(this.confirmations, this.timeoutMs);
    } catch (error) {
      // A timeout or replaced transaction leaves the nonce uncertain: re-read it.
      this.nonces.delete(wallet.address);
      throw error;
    }
    if (!receipt || receipt.status !== 1) {
      throw new Error(`Transaction ${response.hash} failed on chain`);
    }
    const block = await this.registry.provider.getBlock(receipt.blockHash);
    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      blockTime: new Date((block?.timestamp ?? Date.now() / 1000) * 1000),
      gasUsed: receipt.gasUsed,
      from: wallet.address,
      events: this.decodeLogs(receipt),
    };
  }

  /** Decodes the receipt's logs from platform contracts; O(1) contract lookup per log. */
  decodeLogs(receipt: TransactionReceipt): DecodedEvent[] {
    const events: DecodedEvent[] = [];
    for (const log of receipt.logs) {
      const info = this.registry.byContractAddress(log.address);
      if (!info) continue;
      const parsed = info.iface.parseLog(log);
      if (!parsed) continue;
      events.push({
        contract: info.name,
        name: parsed.name,
        args: eventArgs(parsed),
        logIndex: log.index,
      });
    }
    return events;
  }

  /** Runs `task` after every earlier task for the same key has finished. */
  private enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const run = previous.then(task, task);
    const tail = run.catch(() => undefined);
    this.queues.set(key, tail);
    void tail.then(() => {
      if (this.queues.get(key) === tail) this.queues.delete(key);
    });
    return run.catch((error: unknown) => {
      // The nonce may or may not have been used: re-read it next time.
      this.nonces.delete(key);
      throw error;
    });
  }

  private async nextNonce(address: string): Promise<number> {
    const known = this.nonces.get(address);
    if (known !== undefined) return known;
    return this.registry.provider.getTransactionCount(address, 'pending');
  }

  /** Fee data, shared by all sends for a couple of seconds. */
  private feeData(): Promise<FeeData> {
    const now = Date.now();
    if (!this.feeCache || now - this.feeCache.at > FEE_CACHE_MS) {
      const data = this.registry.provider.getFeeData();
      this.feeCache = { at: now, data };
      data.catch(() => {
        if (this.feeCache?.data === data) this.feeCache = undefined;
      });
    }
    return this.feeCache.data;
  }

  private toHttp(error: unknown): HttpException {
    const http = this.decoder.toHttpException(error);
    if (http.getStatus() >= 500) {
      this.logger.error(
        `Blockchain call failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return http;
  }
}

/**
 * Nodes word this differently and ethers only classifies some of them:
 * geth "insufficient funds for gas * price + value", Besu "Upfront cost
 * exceeds account balance", Hardhat "Sender doesn't have enough funds".
 */
const INSUFFICIENT_FUNDS =
  /insufficient funds|doesn't have enough funds|upfront cost exceeds/i;

function isInsufficientFunds(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 5) return false;
  const e = error as Record<string, unknown>;
  if (e.code === 'INSUFFICIENT_FUNDS') return true;
  if (typeof e.message === 'string' && INSUFFICIENT_FUNDS.test(e.message)) {
    return true;
  }
  return ['error', 'info', 'cause'].some((key) =>
    isInsufficientFunds(e[key], depth + 1),
  );
}
