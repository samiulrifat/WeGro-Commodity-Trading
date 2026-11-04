import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertLocal, bringClockToNow, loadEnv } from './local-only';

// The node's answer, as each test sets it.
let network: Promise<{ chainId: bigint }>;
let latest: { timestamp: number };
const send = jest.fn(() => Promise.resolve(null));
jest.mock('ethers', () => ({
  ...jest.requireActual<object>('ethers'),
  JsonRpcProvider: jest.fn(() => ({
    getNetwork: () => network,
    getBlock: () => Promise.resolve(latest),
    send,
    destroy: jest.fn(),
  })),
}));

describe('bringClockToNow', () => {
  const NOW = 1_800_000_000;
  const clock = (behindSeconds: number) => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    latest = { timestamp: NOW - behindSeconds };
    send.mockClear();
  };
  afterEach(() => jest.restoreAllMocks());

  it('moves a clock that is behind up to now', async () => {
    clock(600);
    const log = jest.fn();
    await bringClockToNow(log);
    expect(send.mock.calls).toEqual([
      ['evm_setNextBlockTimestamp', [NOW]],
      ['evm_mine', []],
    ]);
    expect(log).not.toHaveBeenCalled();
  });

  it('leaves a clock that is about right alone', async () => {
    clock(5);
    const log = jest.fn();
    await bringClockToNow(log);
    expect(send).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('says so when the clock is ahead, since it cannot go back', async () => {
    clock(-90 * 86_400);
    const log = jest.fn();
    await bringClockToNow(log);
    expect(send).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('about 90 day(s) ahead'),
    );
  });
});

/** Resets and sample data never reach a real ledger or a production database. */
describe('assertLocal', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('allows the local Hardhat chain', async () => {
    network = Promise.resolve({ chainId: 31337n });
    await expect(assertLocal()).resolves.toBeUndefined();
  });

  it('refuses production, another chain, and a node it cannot reach', async () => {
    process.env.NODE_ENV = 'production';
    await expect(assertLocal()).rejects.toThrow(
      'Refused: NODE_ENV is production',
    );
    process.env.NODE_ENV = 'development';
    process.env.CHAIN_RPC_URL = 'http://node.example:8545';
    network = Promise.resolve({ chainId: 1n });
    await expect(assertLocal()).rejects.toThrow(
      'Refused: chain 1 at http://node.example:8545 is not the local Hardhat node (31337)',
    );
    network = Promise.reject(new Error('ECONNREFUSED'));
    await expect(assertLocal()).rejects.toThrow(
      'Cannot reach the node at http://node.example:8545',
    );
  });
  describe('loadEnv', () => {
    it('reads .env from the working folder when there is one', () => {
      const load = jest
        .spyOn(process, 'loadEnvFile')
        .mockImplementation(() => undefined);
      const dir = mkdtempSync(join(tmpdir(), 'wegro-env-'));
      const cwd = process.cwd();
      process.chdir(dir);
      try {
        loadEnv();
        expect(load).not.toHaveBeenCalled();
        writeFileSync(join(dir, '.env'), 'WEGRO_TEST=1\n');
        loadEnv();
        expect(load).toHaveBeenCalledWith('.env');
      } finally {
        process.chdir(cwd);
        rmSync(dir, { recursive: true, force: true });
        load.mockRestore();
      }
    });
  });
});
