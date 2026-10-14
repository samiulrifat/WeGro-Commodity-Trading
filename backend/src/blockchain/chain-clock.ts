import { Injectable } from '@nestjs/common';
import { ContractsRegistry } from './contracts.registry';

const CACHE_MS = 1000;

/**
 * The chain's notion of now: the latest block's timestamp. Deadlines on the
 * ledger (reservations, sales) are judged by it, and so must the backend's
 * checks be: the server clock can differ (time travel on Hardhat, drift).
 * Shared for a second, so a burst of checks costs one call.
 */
@Injectable()
export class ChainClock {
  private cached?: { at: number; value: Promise<Date> };

  constructor(private readonly registry: ContractsRegistry) {}

  now(): Promise<Date> {
    const at = Date.now();
    if (!this.cached || at - this.cached.at > CACHE_MS) {
      const value = this.registry.provider
        .getBlock('latest')
        .then((b) => new Date((b?.timestamp ?? at / 1000) * 1000));
      value.catch(() => {
        if (this.cached?.value === value) this.cached = undefined;
      });
      this.cached = { at, value };
    }
    return this.cached.value;
  }

  /** Drops the shared reading: the chain's clock jumped (Hardhat time travel). */
  forget(): void {
    this.cached = undefined;
  }
}
