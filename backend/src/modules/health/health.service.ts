import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ContractsRegistry } from '../../blockchain/contracts.registry';
import { EventIndexerService } from '../../blockchain/indexer/event-indexer.service';
import type {
  ChainHealthDto,
  HealthResponseDto,
} from './dto/health-response.dto';

const CHAIN_TIMEOUT_MS = 2000;

@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly contracts: ContractsRegistry,
    private readonly indexer: EventIndexerService,
  ) {}

  async check(): Promise<HealthResponseDto> {
    // Database and chain are checked in parallel.
    const [database, blockNumber] = await Promise.all([
      this.dataSource.query('SELECT 1').then(
        () => 'up' as const,
        () => 'down' as const,
      ),
      this.blockNumber(),
    ]);
    const indexedBlock = database === 'up' ? await this.indexedBlock() : null;
    const chain: ChainHealthDto = {
      status: blockNumber === null ? 'down' : 'up',
      chainId: this.contracts.chainId,
      blockNumber,
      indexedBlock,
      indexerLag:
        blockNumber !== null && indexedBlock !== null
          ? Math.max(0, blockNumber - indexedBlock)
          : null,
    };
    return {
      status: database === 'up' && chain.status === 'up' ? 'ok' : 'degraded',
      database,
      chain,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  private async blockNumber(): Promise<number | null> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), CHAIN_TIMEOUT_MS);
    });
    try {
      return await Promise.race([
        this.contracts.provider.getBlockNumber(),
        timeout,
      ]);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async indexedBlock(): Promise<number | null> {
    try {
      return (await this.indexer.status()).lastBlock;
    } catch {
      return null;
    }
  }
}
