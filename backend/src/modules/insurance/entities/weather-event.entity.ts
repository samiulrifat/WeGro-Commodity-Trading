import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { Severity } from '../insurance.enums';

/** A (pretend) weather event in a district, fingerprinted on the ledger. Claims cite it. */
@Entity('weather_events')
@Index('ix_weather_events_district', ['districtCode', 'occurredOn'])
@Check('ck_weather_events_status', `"status" IN ('submitted', 'recorded')`)
@Check(
  'ck_weather_events_severity',
  `"severity" IN ('low', 'moderate', 'severe')`,
)
export class WeatherEvent {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'varchar', length: 20 })
  districtCode: string;

  @Column({ type: 'varchar', length: 31 })
  eventTypeCode: string;

  @Column({ type: 'date' })
  occurredOn: string;

  @Column({ type: 'varchar', length: 10 })
  severity: Severity;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  notes: string | null;

  @Column({ type: 'char', length: 66 })
  detailsHash: string;

  @Column({ type: 'uuid' })
  recordedById: string;

  @Column({ type: 'varchar', length: 10 })
  status: 'submitted' | 'recorded';

  @Column({ type: 'timestamptz', nullable: true })
  recordedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
