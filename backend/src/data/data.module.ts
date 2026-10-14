import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportRecord } from './entities/import-record.entity';

/** Tables of the data tools (import tracking). The tools themselves are scripts. */
@Module({ imports: [TypeOrmModule.forFeature([ImportRecord])] })
export class DataModule {}
