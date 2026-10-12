import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { Project } from '../projects/entities/project.entity';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { FieldRecord } from './entities/field-record.entity';
import { Photo } from './entities/photo.entity';
import { FieldRecordLedgerSync } from './field-record-ledger.sync';
import { FieldRecordsController } from './field-records.controller';
import { FieldRecordsService } from './field-records.service';
import { PhotosService } from './photos.service';

/** Farm updates with photos and locations (FieldRecordLog). */
@Module({
  imports: [
    TypeOrmModule.forFeature([FieldRecord, Photo, Project]),
    CatalogModule,
    UsersModule,
    ProjectsModule,
  ],
  controllers: [FieldRecordsController],
  providers: [FieldRecordsService, PhotosService, FieldRecordLedgerSync],
})
export class FieldRecordsModule {}
