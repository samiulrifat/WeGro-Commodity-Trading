import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PROBLEMS, type Problem } from '../indexer-watchdog.job';

export class SystemChainDto {
  @ApiProperty({ enum: ['up', 'down'] })
  status: 'up' | 'down';

  @ApiProperty({ example: 31337 })
  chainId: number;

  @ApiPropertyOptional({ nullable: true, type: Number })
  blockNumber: number | null;

  @ApiPropertyOptional({
    nullable: true,
    type: Date,
    description: "The ledger's own time (its latest block)",
  })
  ledgerTime: Date | null;
}

export class SystemIndexerDto {
  @ApiProperty({ description: 'Copying ledger events is switched on' })
  enabled: boolean;

  @ApiProperty({ description: 'The copying loop is running' })
  running: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Last block whose events are in the database',
  })
  indexedBlock: number | null;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description:
      'Blocks behind the ledger beyond those still awaiting confirmation (as the watchdog counts)',
  })
  behind: number | null;

  @ApiProperty({
    description: 'How far behind it may fall (WATCHDOG_LAG_BLOCKS)',
  })
  allowedBehind: number;

  @ApiProperty({ description: 'Blocks on top before one is copied' })
  confirmations: number;

  @ApiProperty({ description: 'Copying passes failed in a row' })
  failures: number;

  @ApiPropertyOptional({ nullable: true, type: String })
  lastError: string | null;
}

export class SystemIncidentDto {
  @ApiProperty({ enum: PROBLEMS })
  problem: Problem;

  @ApiProperty()
  since: Date;
}

export class SystemStatusDto {
  @ApiProperty({
    enum: ['ok', 'degraded', 'down'],
    description:
      'ok: all well; degraded: the node, the copy of the ledger or an incident needs attention; down: no database',
  })
  status: 'ok' | 'degraded' | 'down';

  @ApiProperty()
  checkedAt: Date;

  @ApiProperty({ enum: ['up', 'down'] })
  database: 'up' | 'down';

  @ApiProperty({ type: SystemChainDto })
  chain: SystemChainDto;

  @ApiProperty({ type: SystemIndexerDto })
  indexer: SystemIndexerDto;

  @ApiPropertyOptional({
    nullable: true,
    type: SystemIncidentDto,
    description: 'What the watchdog last found wrong, until it is resolved',
  })
  incident: SystemIncidentDto | null;

  @ApiProperty()
  uptimeSeconds: number;
}
