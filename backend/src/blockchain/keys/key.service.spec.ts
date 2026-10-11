import type { ConfigService } from '@nestjs/config';
import { JsonRpcProvider, Network } from 'ethers';
import type { DataSource } from 'typeorm';
import type { EnvironmentVariables } from '../../config/env.validation';
import type { ContractsRegistry } from '../contracts.registry';
import { KeyService } from './key.service';

// Hardhat's well-known test phrase: its accounts are public reference values.
const MNEMONIC = 'test test test test test test test test test test test junk';

function build(query = jest.fn()) {
  const config = {
    get: () => MNEMONIC,
  } as unknown as ConfigService<EnvironmentVariables, true>;
  const registry = {
    provider: new JsonRpcProvider('http://127.0.0.1:1', Network.from(31337), {
      staticNetwork: true,
    }),
  } as unknown as ContractsRegistry;
  return {
    keys: new KeyService(config, registry, { query } as unknown as DataSource),
    query,
  };
}

describe('KeyService', () => {
  const { keys } = build();

  it('derives the standard BIP-44 Ethereum accounts', () => {
    expect(keys.operatorAddress()).toBe(
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    );
    expect(keys.addressOf(1)).toBe(
      '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    );
    expect(keys.addressOf(2)).toBe(
      '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    );
  });

  it('gives each index its own key, connected to the chain', () => {
    const a = keys.signerFor(5);
    const b = keys.signerFor(6);
    expect(a.address).not.toBe(b.address);
    expect(a.provider).not.toBeNull();
    expect(keys.signerFor(5)).toBe(a);
  });

  it('derives the same key again after it falls out of the cache', () => {
    const first = keys.addressOf(7);
    for (let i = 100; i < 100 + 1100; i++) keys.signerFor(i);
    expect(keys.addressOf(7)).toBe(first);
  });

  it('rejects out-of-range indexes', () => {
    for (const bad of [-1, 1.5, 2 ** 31, Number.NaN]) {
      expect(() => keys.signerFor(bad)).toThrow('Invalid key index');
    }
  });

  it('allocates indexes from the database sequence', async () => {
    const { keys: k, query } = build(
      jest.fn().mockResolvedValue([{ index: '42' }]),
    );
    await expect(k.allocateIndex()).resolves.toBe(42);
    expect(query).toHaveBeenCalledWith(
      "SELECT nextval('signer_key_index_seq') AS index",
    );
  });
});
