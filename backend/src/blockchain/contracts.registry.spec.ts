import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { config } from '../../test/support/unit';
import {
  CONTRACT_NAMES,
  ContractsRegistry,
  DeploymentMismatchError,
  loadDeployment,
} from './contracts.registry';

/** One made-up address per contract, as Ignition writes them. */
const ADDRESSES = Object.fromEntries(
  CONTRACT_NAMES.map((name, i) => [
    `PlatformModule#${name}`,
    `0x${String(i + 1).padStart(40, '0')}`,
  ]),
);

/**
 * The start-up check of the deployment against the node, with the node's
 * answers scripted: each way it can be wrong is named, and an unreachable
 * node only warns (the app starts and calls fail until it is up).
 */
describe('ContractsRegistry', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'wegro-deployment-'));
    writeFileSync(
      join(dir, 'deployed_addresses.json'),
      JSON.stringify(ADDRESSES),
    );
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  afterEach(() => jest.restoreAllMocks());

  const build = (
    answers: {
      chainId?: bigint;
      noCode?: string;
      registry?: string;
      linked?: boolean;
      unreachable?: boolean;
    } = {},
  ) => {
    const registry = new ContractsRegistry(
      config({
        CHAIN_ID: 31337,
        CHAIN_RPC_URL: 'http://127.0.0.1:1',
        CONTRACTS_DEPLOYMENT_DIR: dir,
      }),
    );
    const access = registry.info('AccessRegistry').address;
    const fail = () =>
      answers.unreachable
        ? Promise.reject(new Error('connect ECONNREFUSED'))
        : undefined;
    jest
      .spyOn(registry.provider, 'getNetwork')
      .mockImplementation(
        () =>
          fail() ??
          Promise.resolve({ chainId: answers.chainId ?? 31337n } as never),
      );
    jest
      .spyOn(registry.provider, 'getCode')
      .mockImplementation(
        (address) =>
          fail() ?? Promise.resolve(address === answers.noCode ? '0x' : '0x60'),
      );
    const contracts = (registry as unknown as { contracts: object })
      .contracts as Record<string, Record<string, unknown>>;
    for (const name of CONTRACT_NAMES) {
      contracts[name] = {
        registry: () => Promise.resolve(answers.registry ?? access),
        isLinkedContract: () => Promise.resolve(answers.linked ?? true),
        connect: (signer: unknown) => ({ name, signer }),
      };
    }
    return registry;
  };

  it('starts when the deployment matches the node', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await expect(build().onModuleInit()).resolves.toBeUndefined();
  });

  it('refuses to start on the wrong chain, naming it', async () => {
    await expect(build({ chainId: 1n }).onModuleInit()).rejects.toThrow(
      'node is chain 1, CHAIN_ID is 31337',
    );
  });

  it('names a contract with no code, one wired to another registry, and every missing link', async () => {
    const stray = '0x00000000000000000000000000000000000000ff';
    const err = (await build({
      noCode: ADDRESSES['PlatformModule#TradeLedger'],
      registry: stray,
      linked: false,
    })
      .onModuleInit()
      .catch((e: unknown) => e)) as DeploymentMismatchError;
    expect(err).toBeInstanceOf(DeploymentMismatchError);
    expect(err.problems).toEqual(
      expect.arrayContaining([
        `no contract code at TradeLedger (${ADDRESSES['PlatformModule#TradeLedger']})`,
        expect.stringMatching(/^ProjectLedger points at AccessRegistry 0x0+ff/),
        'VoucherRegistry is not linked in ProjectLedger',
        'SettlementLedger is not linked in ProjectLedger',
        'TradeLedger is not linked in WarehouseReceipt',
      ]),
    );
  });

  it('only warns while the node cannot be reached', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    await expect(
      build({ unreachable: true }).onModuleInit(),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('is not reachable yet'),
    );
  });

  it('finds a platform contract by its address in any case, and nothing else', () => {
    const registry = build();
    const address = ADDRESSES['PlatformModule#TradeLedger'];
    expect(registry.byContractAddress(address.toUpperCase())?.name).toBe(
      'TradeLedger',
    );
    expect(registry.byContractAddress(`0x${'9'.repeat(40)}`)).toBeUndefined();
  });

  it('says how to deploy when the addresses are missing or incomplete', () => {
    expect(() => loadDeployment(join(dir, 'nowhere'))).toThrow(
      'Deploy the contracts',
    );
    const partial = mkdtempSync(join(tmpdir(), 'wegro-partial-'));
    writeFileSync(
      join(partial, 'deployed_addresses.json'),
      JSON.stringify({
        'PlatformModule#AccessRegistry':
          ADDRESSES['PlatformModule#AccessRegistry'],
      }),
    );
    expect(() => loadDeployment(partial)).toThrow(
      'has no address for ProjectLedger',
    );
    rmSync(partial, { recursive: true, force: true });
  });
  it('gives a contract that sends as the signer it is asked for', () => {
    const signer = { address: '0x1' };
    expect(build().connect('TradeLedger', signer as never)).toEqual({
      name: 'TradeLedger',
      signer,
    });
  });
});
