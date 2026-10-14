import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class JobRunDto {
  @ApiProperty({ enum: ['schedule', 'manual'] })
  trigger: 'schedule' | 'manual';

  @ApiPropertyOptional({
    nullable: true,
    type: Object,
    description: 'Who ran it by hand',
  })
  triggeredBy: { id: string; name: string } | null;

  @ApiProperty()
  startedAt: Date;

  @ApiProperty()
  finishedAt: Date;

  @ApiProperty({ enum: ['ok', 'failed'] })
  outcome: 'ok' | 'failed';

  @ApiProperty({ description: 'Items handled' })
  items: number;

  @ApiPropertyOptional({ nullable: true, type: String })
  error: string | null;
}

export class JobStatusDto {
  @ApiProperty({ example: 'reservation-expiry' })
  name: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ example: 60000 })
  everyMs: number;

  @ApiProperty({ description: 'Scheduled runs on (JOBS_ENABLED)' })
  enabled: boolean;

  @ApiProperty()
  running: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: JobRunDto,
    description: 'Since the server started',
  })
  lastRun: JobRunDto | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  nextRunAt: Date | null;
}

export class JobHistoryQueryDto extends PaginationQueryDto {}
