import { ApiProperty } from '@nestjs/swagger';

export class ChainHealthDto {
  @ApiProperty({ enum: ['up', 'down'] })
  status: 'up' | 'down';

  @ApiProperty({ example: 31337 })
  chainId: number;

  @ApiProperty({ example: 1520, nullable: true, type: Number })
  blockNumber: number | null;

  @ApiProperty({
    example: 1519,
    nullable: true,
    type: Number,
    description: 'Last block whose events are stored in the database.',
  })
  indexedBlock: number | null;

  @ApiProperty({
    example: 1,
    nullable: true,
    type: Number,
    description: 'How many blocks the database is behind the chain.',
  })
  indexerLag: number | null;
}

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok', 'degraded'] })
  status: 'ok' | 'degraded';

  @ApiProperty({ enum: ['up', 'down'] })
  database: 'up' | 'down';

  @ApiProperty({ type: ChainHealthDto })
  chain: ChainHealthDto;

  @ApiProperty({ example: 42 })
  uptimeSeconds: number;
}
