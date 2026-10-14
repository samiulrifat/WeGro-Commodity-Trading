import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { Photo } from '../field-records/entities/photo.entity';
import { FieldRecordsModule } from '../field-records/field-records.module';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { BanksService } from './banks.service';
import { Bank } from './entities/bank.entity';
import { BankConsent } from './entities/bank-consent.entity';
import { BankOfficer } from './entities/bank-officer.entity';
import { LegacyProject } from './entities/legacy-project.entity';
import { SummaryView } from './entities/summary-view.entity';
import { TrackRecord } from './entities/track-record.entity';
import { TrackRecordController } from './track-record.controller';
import { TrackRecordLedgerSync } from './track-record-ledger.sync';
import { TrackRecordBuilder } from './track-record-summary';
import { TrackRecordsService } from './track-records.service';

/** Farmer track records, banks and bank permission (ConsentRegistry). */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Bank,
      BankOfficer,
      TrackRecord,
      BankConsent,
      SummaryView,
      LegacyProject,
      Photo,
    ]),
    CatalogModule,
    UsersModule,
    ProjectsModule,
    FieldRecordsModule,
  ],
  controllers: [TrackRecordController],
  providers: [
    BanksService,
    TrackRecordsService,
    TrackRecordBuilder,
    TrackRecordLedgerSync,
  ],
})
export class TrackRecordModule {}
