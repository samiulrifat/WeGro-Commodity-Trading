import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  getAddress,
  type Interface,
  JsonRpcProvider,
  Network,
  type Signer,
} from 'ethers';
import type { EnvironmentVariables } from '../config/env.validation';
import {
  type AccessRegistry,
  AccessRegistry__factory,
  type ConsentRegistry,
  ConsentRegistry__factory,
  type FieldRecordLog,
  FieldRecordLog__factory,
  type InsuranceRegistry,
  InsuranceRegistry__factory,
  type ProjectLedger,
  ProjectLedger__factory,
  type SettlementLedger,
  SettlementLedger__factory,
  type TradeLedger,
  TradeLedger__factory,
  type VoucherRegistry,
  VoucherRegistry__factory,
  type WarehouseReceipt,
  WarehouseReceipt__factory,
} from './generated';

/** Typed contract instance for each deployed platform contract. */
export interface PlatformContracts {
  AccessRegistry: AccessRegistry;
  ProjectLedger: ProjectLedger;
  VoucherRegistry: VoucherRegistry;
  FieldRecordLog: FieldRecordLog;
  WarehouseReceipt: WarehouseReceipt;
  TradeLedger: TradeLedger;
  InsuranceRegistry: InsuranceRegistry;
  SettlementLedger: SettlementLedger;
  ConsentRegistry: ConsentRegistry;
}

export type ContractName = keyof PlatformContracts;

export const FACTORIES: {
  [N in ContractName]: {
    connect(address: string, runner?: null): PlatformContracts[N];
    createInterface(): Interface;
  };
} = {
  AccessRegistry: AccessRegistry__factory,
  ProjectLedger: ProjectLedger__factory,
  VoucherRegistry: VoucherRegistry__factory,
  FieldRecordLog: FieldRecordLog__factory,
  WarehouseReceipt: WarehouseReceipt__factory,
  TradeLedger: TradeLedger__factory,
  InsuranceRegistry: InsuranceRegistry__factory,
  SettlementLedger: SettlementLedger__factory,
  ConsentRegistry: ConsentRegistry__factory,
};

export const CONTRACT_NAMES = Object.keys(FACTORIES) as ContractName[];

/** Contracts built on AccessGuarded: each must point at the deployed AccessRegistry. */
const GUARDED: ContractName[] = CONTRACT_NAMES.filter(
  (n) => n !== 'AccessRegistry',
);

export interface ContractInfo {
  name: ContractName;
  address: string;
  iface: Interface;
}

/**
 * The deployed platform contracts. Loads their addresses from the Hardhat
 * Ignition deployment, creates one typed read-only instance and one Interface
 * per contract, and indexes them by address for O(1) log decoding.
 */
@Injectable()
export class ContractsRegistry implements OnModuleInit {
  private readonly logger = new Logger(ContractsRegistry.name);

  readonly provider: JsonRpcProvider;
  readonly chainId: number;
  private readonly rpcUrl: string;
  private readonly contracts: PlatformContracts;
  private readonly byName = new Map<ContractName, ContractInfo>();
  private readonly byAddress = new Map<string, ContractInfo>();

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.chainId = config.get('CHAIN_ID', { infer: true });
    this.rpcUrl = config.get('CHAIN_RPC_URL', { infer: true });
    const network = Network.from(this.chainId);
    // staticNetwork: the chain id is fixed, so ethers never re-queries it.
    // Calls issued in the same tick are sent as one JSON-RPC batch.
    this.provider = new JsonRpcProvider(this.rpcUrl, network, {
      staticNetwork: network,
      batchMaxCount: 100,
      batchStallTime: 5,
      // No 250ms result cache: reads right after a mined tx must see it.
      cacheTimeout: -1,
    });

    const addresses = loadDeployment(
      config.get('CONTRACTS_DEPLOYMENT_DIR', { infer: true }),
    );
    const contracts = {} as Record<ContractName, unknown>;
    for (const name of CONTRACT_NAMES) {
      const address = addresses[name];
      const factory = FACTORIES[name];
      const instance = factory.connect(address, null);
      contracts[name] = instance.connect(this.provider);
      const info: ContractInfo = {
        name,
        address,
        iface: factory.createInterface(),
      };
      this.byName.set(name, info);
      this.byAddress.set(address.toLowerCase(), info);
    }
    this.contracts = contracts as PlatformContracts;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.verifyDeployment();
    } catch (error) {
      if (error instanceof DeploymentMismatchError) throw error;
      this.logger.warn(
        `Blockchain node at ${this.rpcUrl} is not reachable yet; ` +
          'contract calls will fail until it is.',
      );
    }
  }

  /** Read-only typed instance (calls run against the provider). */
  get<N extends ContractName>(name: N): PlatformContracts[N] {
    return this.contracts[name];
  }

  /** Typed instance that sends transactions as `signer`. Reuses the parsed ABI. */
  connect<N extends ContractName>(
    name: N,
    signer: Signer,
  ): PlatformContracts[N] {
    return this.contracts[name].connect(signer) as PlatformContracts[N];
  }

  info(name: ContractName): ContractInfo {
    return this.byName.get(name)!;
  }

  /** O(1): which platform contract, if any, lives at `address`. */
  byContractAddress(address: string): ContractInfo | undefined {
    return this.byAddress.get(address.toLowerCase());
  }

  all(): ContractInfo[] {
    return [...this.byName.values()];
  }

  addresses(): string[] {
    return this.all().map((c) => c.address);
  }

  /**
   * Fails startup when the configured deployment does not match the chain:
   * wrong chain id, no code at an address, or contracts wired to each other
   * incorrectly. All calls go out together as one JSON-RPC batch.
   */
  private async verifyDeployment(): Promise<void> {
    const access = this.info('AccessRegistry').address;
    const [
      network,
      codes,
      registries,
      voucherLinked,
      settlementLinked,
      tradeLinked,
    ] = await Promise.all([
      this.provider.getNetwork(),
      Promise.all(this.all().map((c) => this.provider.getCode(c.address))),
      Promise.all(
        GUARDED.map((n) =>
          (
            this.contracts[n] as unknown as { registry(): Promise<string> }
          ).registry(),
        ),
      ),
      this.contracts.ProjectLedger.isLinkedContract(
        this.info('VoucherRegistry').address,
      ),
      this.contracts.ProjectLedger.isLinkedContract(
        this.info('SettlementLedger').address,
      ),
      this.contracts.WarehouseReceipt.isLinkedContract(
        this.info('TradeLedger').address,
      ),
    ]);

    const problems: string[] = [];
    if (Number(network.chainId) !== this.chainId) {
      problems.push(
        `node is chain ${network.chainId}, CHAIN_ID is ${this.chainId}`,
      );
    }
    this.all().forEach((c, i) => {
      if (codes[i] === '0x')
        problems.push(`no contract code at ${c.name} (${c.address})`);
    });
    GUARDED.forEach((n, i) => {
      if (getAddress(registries[i]) !== access) {
        problems.push(
          `${n} points at AccessRegistry ${registries[i]}, expected ${access}`,
        );
      }
    });
    if (!voucherLinked)
      problems.push('VoucherRegistry is not linked in ProjectLedger');
    if (!settlementLinked)
      problems.push('SettlementLedger is not linked in ProjectLedger');
    if (!tradeLinked)
      problems.push('TradeLedger is not linked in WarehouseReceipt');

    if (problems.length > 0) {
      throw new DeploymentMismatchError(problems);
    }
    this.logger.log(
      `Connected to chain ${this.chainId}: ${CONTRACT_NAMES.length} contracts verified`,
    );
  }
}

export class DeploymentMismatchError extends Error {
  constructor(readonly problems: string[]) {
    super(
      `Contract deployment does not match the chain: ${problems.join('; ')}`,
    );
  }
}

/** Reads `deployed_addresses.json` and returns a checksummed address per contract. */
export function loadDeployment(dir: string): Record<ContractName, string> {
  const file = resolve(process.cwd(), dir, 'deployed_addresses.json');
  let raw: Record<string, string>;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
  } catch {
    throw new Error(
      `Cannot read contract addresses from ${file}. Deploy the contracts ` +
        '(npx hardhat ignition deploy ignition/modules/Platform.ts --network localhost) ' +
        'or fix CONTRACTS_DEPLOYMENT_DIR.',
    );
  }
  const result = {} as Record<ContractName, string>;
  for (const name of CONTRACT_NAMES) {
    const address = raw[`PlatformModule#${name}`];
    if (!address) throw new Error(`${file} has no address for ${name}`);
    result[name] = getAddress(address);
  }
  return result;
}
