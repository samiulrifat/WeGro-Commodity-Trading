import { RecordLinkDto } from '../../../common/swagger/refs';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  NotificationCategory,
  NotificationKind,
  type NotificationParams,
} from '../notification.enums';

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({ description: 'Only unread ones' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : value === true || value === 'true',
  )
  @IsBoolean()
  unread?: boolean;

  @ApiPropertyOptional({
    description: 'Older than this id: pass nextBefore from the previous page',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  before?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class NotificationDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ enum: NotificationCategory })
  category: NotificationCategory;

  @ApiProperty({ enum: NotificationKind, enumName: 'NotificationKind' })
  kind: NotificationKind;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  body: string | null;

  @ApiPropertyOptional({
    type: 'object',
    nullable: true,
    additionalProperties: {
      oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
      nullable: true,
    },
    example: { reservationId: '12', slots: 3, project: 'Bogura maize 2026' },
    description:
      'Values in the text, for wording it in the reader’s language (amounts as taka strings, dates as ISO); title and body are the English wording',
  })
  params: NotificationParams | null;

  @ApiPropertyOptional({
    type: RecordLinkDto,
    nullable: true,
    description: 'What it is about',
  })
  subject: { type: string; id: string } | null;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({ nullable: true, type: Date })
  readAt: Date | null;
}

export class NotificationPageDto {
  @ApiProperty({ type: [NotificationDto], description: 'Newest first' })
  items: NotificationDto[];

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Pass as before= for the next page; null at the end',
  })
  nextBefore: number | null;
}

export class UnreadCountDto {
  @ApiProperty()
  unread: number;
}

export class MarkedReadDto {
  @ApiProperty({ description: 'How many were marked read' })
  marked: number;
}
