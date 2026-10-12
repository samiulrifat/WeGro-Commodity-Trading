import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { FieldRecordType } from './entities/field-record-type.entity';
import { InputType } from './entities/input-type.entity';
import { ProduceType } from './entities/produce-type.entity';
import { Unit } from './entities/unit.entity';
import { WeatherEventType } from './entities/weather-event-type.entity';

/** Produce, units, inputs, field-record and weather-event types; database only. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Unit,
      ProduceType,
      InputType,
      FieldRecordType,
      WeatherEventType,
    ]),
  ],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
