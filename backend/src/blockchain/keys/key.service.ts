import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HDNodeWallet } from 'ethers';
import { DataSource } from 'typeorm';
import type { EnvironmentVariables } from '../../config/env.validation';
import { ContractsRegistry } from '../contracts.registry';

/** BIP-44 Ethereum account path; each person is one child index under it. */
const ACCOUNT_PATH = "m/44'/60'/0'/0";
const MAX_INDEX = 2 ** 31 - 1;
const CACHE_SIZE = 1024;
export const KEY_INDEX_SEQUENCE = 'signer_key_index_seq';

/**
 * Every person's signing key, derived from one master seed. Index 0 is the
 * platform operator (super admin, pays fees); users get 1, 2, 3... from a
 * database sequence. Private keys never leave this service and the
 * transaction service: the rest of the backend only sees addresses.
 */
@Injectable()
export class KeyService {
  static readonly OPERATOR_INDEX = 0;

  private readonly root: HDNodeWallet;
  /** Recently used keys, oldest first: Map keeps insertion order, so LRU is O(1). */
  private readonly cache = new Map<number, HDNodeWallet>();

  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    private readonly registry: ContractsRegistry,
    private readonly dataSource: DataSource,
  ) {
    // The seed derivation (PBKDF2, 2048 rounds) runs once; each user key is
    // then a single non-hardened child derivation from this node.
    this.root = deriveAccountRoot(
      config.get('KEY_MASTER_MNEMONIC', { infer: true }),
    );
  }

  /** The key at `index`, connected to the chain. For the transaction service only. */
  signerFor(index: number): HDNodeWallet {
    assertIndex(index);
    const cached = this.cache.get(index);
    if (cached) {
      this.cache.delete(index);
      this.cache.set(index, cached);
      return cached;
    }
    const wallet = this.root.deriveChild(index).connect(this.registry.provider);
    this.cache.set(index, wallet);
    if (this.cache.size > CACHE_SIZE) {
      this.cache.delete(this.cache.keys().next().value as number);
    }
    return wallet;
  }

  addressOf(index: number): string {
    return this.signerFor(index).address;
  }

  operatorAddress(): string {
    return this.addressOf(KeyService.OPERATOR_INDEX);
  }

  /**
   * Reserves the next unused key index. A database sequence is atomic, so two
   * people created at the same moment can never share a key.
   */
  async allocateIndex(): Promise<number> {
    const rows: Array<{ index: string }> = await this.dataSource.query(
      `SELECT nextval('${KEY_INDEX_SEQUENCE}') AS index`,
    );
    const index = Number(rows[0].index);
    assertIndex(index);
    return index;
  }
}

/** The BIP-44 account node every key index is a child of. */
export function deriveAccountRoot(mnemonic: string): HDNodeWallet {
  return HDNodeWallet.fromPhrase(mnemonic.trim(), undefined, ACCOUNT_PATH);
}

function assertIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index > MAX_INDEX) {
    throw new Error(`Invalid key index ${index}`);
  }
}
