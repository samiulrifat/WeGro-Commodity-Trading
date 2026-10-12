import { Check, Column, Entity, Index } from 'typeorm';
import { CatalogEntry } from './catalog-entry.base';

/** A kind of weather event insurance can record, e.g. FLOOD. */
@Entity('weather_event_types')
@Check('ck_weather_event_types_code', `"code" ~ '^[A-Z0-9_-]{1,31}$'`)
@Index('uq_weather_event_types_name', { synchronize: false })
export class WeatherEventType extends CatalogEntry {
  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;
}
