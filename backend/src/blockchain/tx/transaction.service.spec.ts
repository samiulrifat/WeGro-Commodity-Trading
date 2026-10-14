import { ServiceUnavailableException } from '@nestjs/common';
import { AbiCoder, concat, id } from 'ethers';
import { config } from '../../../test/support/unit';
import { CONTRACT_NAMES, FACTORIES } from '../contracts.registry';
import { ContractRevertException } from '../errors/contract-errors';
import { KeyService } from '../keys/key.service';
import { TransactionService } from './transaction.service';

const OPERATOR = KeyService.OPERATOR_INDEX;
const interfaces = CONTRACT_NAMES.map((n) => ({
  name: n,
  iface: FACTORIES[n].createInterface(),
}));

/** A revert as a node reports it during gas estimation. */
const revertError = () =>
  Object.assign(new Error('execution reverted'), {
    data: concat([
      id('ParticipantAlreadyRegistered(bytes32)').slice(0, 10),
      AbiCoder.defaultAbiCoder().encode(['bytes32'], ['0x' + 'ab'.repeat(32)]),
    ]),
  });

/**
 * A scripted node: per-address nonces and balances, sends that wait for a
 * tick so ordering problems show, and failures to order.
 */
function setup(over: { fundingWei?: string } = {}) {
  const broadcast: Array<{ from: string; nonce: number; to?: string }> = [];
  const chainNonce = new Map<string, number>();
  const sendFailures: Error[] = [];
  const provider = {
    estimateGas: jest.fn(() => Promise.resolve(100_000n)),
    getFeeData: jest.fn(() =>
      Promise.resolve({
        maxFeePerGas: 2n,
        maxPriorityFeePerGas: 1n,
        gasPrice: null,
      }),
    ),
    getTransactionCount: jest.fn((address: string) =>
      Promise.resolve(chainNonce.get(address) ?? 0),
    ),
    getBalance: jest.fn(() => Promise.resolve(0n)),
    getBlock: jest.fn(() => Promise.resolve({ timestamp: 1_790_000_000 })),
  };
  const wallet = (index: number) => {
    const address = `0x${String(index).padStart(40, '0')}`;
    return {
      address,
      sendTransaction: jest.fn(
        async (req: { nonce: number; to?: string; gasLimit: bigint }) => {
          await new Promise((r) => setImmediate(r));
          const failure = sendFailures.shift();
          if (failure) throw failure;
          broadcast.push({ from: address, nonce: req.nonce, to: req.to });
          chainNonce.set(address, req.nonce + 1);
          return {
            hash: `0xtx${broadcast.length}`,
            wait: () =>
              Promise.resolve({
                hash: `0xtx${broadcast.length}`,
                blockNumber: broadcast.length,
                blockHash: '0xblock',
                status: 1,
                gasUsed: 21_000n,
                logs: [],
              }),
          };
        },
      ),
    };
  };
  const wallets = new Map<number, ReturnType<typeof wallet>>();
  const keys = {
    signerFor: (i: number) => {
      if (!wallets.has(i)) wallets.set(i, wallet(i));
      return wallets.get(i)!;
    },
  };
  const registry = {
    provider,
    chainId: 31337n,
    all: () => interfaces,
    byContractAddress: () => undefined,
    get: () => ({
      call: {
        populateTransaction: () => Promise.resolve({ to: '0xc', data: '0x' }),
      },
    }),
  };
  const service = new TransactionService(
    config({
      TX_CONFIRMATIONS: 1,
      TX_TIMEOUT_MS: 1000,
      KEY_FUNDING_WEI: over.fundingWei ?? '1000000',
    }),
    registry as never,
    keys as never,
  );
  const quiet = service as unknown as {
    logger: { error: () => void; log: () => void };
  };
  jest.spyOn(quiet.logger, 'error').mockImplementation(() => undefined);
  jest.spyOn(quiet.logger, 'log').mockImplementation(() => undefined);
  const send = (signer: number) =>
    service.send(signer, 'AccessRegistry', (c) =>
      (
        c as unknown as {
          call: { populateTransaction: () => Promise<never> };
        }
      ).call.populateTransaction(),
    );
  return { service, provider, broadcast, send, sendFailures, keys };
}

describe('TransactionService', () => {
  it('simulates, prices with a 20% gas buffer, broadcasts and returns the mined result', async () => {
    const { send, broadcast, keys } = setup();
    const result = await send(5);
    expect(result).toMatchObject({ hash: '0xtx1', blockNumber: 1, events: [] });
    expect(result.blockTime).toEqual(new Date(1_790_000_000_000));
    const sent = keys.signerFor(5).sendTransaction.mock.calls[0][0];
    expect(sent.gasLimit).toBe(120_000n);
    expect(broadcast).toEqual([
      { from: keys.signerFor(5).address, nonce: 0, to: '0xc' },
    ]);
  });

  it('turns a contract refusal into a decoded error before any nonce is spent', async () => {
    const { send, provider, broadcast } = setup();
    provider.estimateGas.mockRejectedValueOnce(revertError());
    const err = await send(5).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ContractRevertException);
    expect((err as ContractRevertException).revert.name).toBe(
      'ParticipantAlreadyRegistered',
    );
    expect(provider.getTransactionCount).not.toHaveBeenCalled();
    expect(broadcast).toEqual([]);
  });

  it('answers 503 when the node cannot be reached', async () => {
    const { send, provider } = setup();
    provider.estimateGas.mockRejectedValueOnce(
      Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
      }),
    );
    await expect(send(5)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('gives concurrent sends from one key consecutive nonces, reading the count once', async () => {
    const { send, provider, broadcast } = setup();
    await Promise.all([send(7), send(7), send(7), send(8)]);
    const nonces = (n: number) =>
      broadcast
        .filter((b) => b.from.endsWith(`${n}`.padStart(40, '0')))
        .map((b) => b.nonce);
    expect(nonces(7)).toEqual([0, 1, 2]);
    expect(nonces(8)).toEqual([0]);
    expect(provider.getTransactionCount).toHaveBeenCalledTimes(2); // once per key
  });

  it('re-reads the nonce after a failed broadcast', async () => {
    const { send, provider, sendFailures } = setup();
    await send(7);
    sendFailures.push(new Error('nonce too low'));
    await expect(send(7)).rejects.toThrow();
    await send(7);
    expect(provider.getTransactionCount).toHaveBeenCalledTimes(2);
  });

  it('funds a new key from the operator when it cannot pay, then retries once', async () => {
    const { send, sendFailures, broadcast, keys } = setup();
    sendFailures.push(new Error("Sender doesn't have enough funds to send tx"));
    await send(9);
    const operator = keys.signerFor(OPERATOR).address;
    const key = keys.signerFor(9).address;
    expect(broadcast).toEqual([
      { from: operator, nonce: 0, to: key },
      { from: key, nonce: 0, to: '0xc' },
    ]);
  });

  it('does not fund when funding is off (free-gas networks)', async () => {
    const { send, sendFailures, broadcast } = setup({ fundingWei: '0' });
    sendFailures.push(
      Object.assign(new Error('x'), { code: 'INSUFFICIENT_FUNDS' }),
    );
    await expect(send(9)).rejects.toThrow();
    expect(broadcast).toEqual([]);
  });

  it('tops a key up to the funding amount only when below half of it', async () => {
    const { service, provider, broadcast } = setup({ fundingWei: '1000' });
    provider.getBalance.mockResolvedValueOnce(600n);
    await expect(service.ensureFunded('0xabc')).resolves.toBe(false);
    provider.getBalance.mockResolvedValueOnce(100n);
    await expect(service.ensureFunded('0xabc')).resolves.toBe(true);
    expect(broadcast).toHaveLength(1);
  });

  it('shares fee data between sends close together', async () => {
    const { send, provider } = setup();
    await Promise.all([send(1), send(2), send(3)]);
    expect(provider.getFeeData).toHaveBeenCalledTimes(1);
  });
});
