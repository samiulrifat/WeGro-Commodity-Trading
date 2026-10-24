import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { Photo } from '../field-records/entities/photo.entity';
import { FieldRecordsModule } from '../field-records/field-records.module';
import { Project } from '../projects/entities/project.entity';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { ClaimsService } from './claims.service';
import { CoverageTerms } from './entities/coverage-terms.entity';
import { InsuranceClaim } from './entities/insurance-claim.entity';
import { InsurerAssignment } from './entities/insurer-assignment.entity';
import { WeatherEvent } from './entities/weather-event.entity';
import { InsuranceController } from './insurance.controller';
import { InsuranceLedgerSync } from './insurance-ledger.sync';
import { InsuranceService } from './insurance.service';

/** Crop insurance (InsuranceRegistry): cover, weather events and claims. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CoverageTerms,
      WeatherEvent,
      InsuranceClaim,
      InsurerAssignment,
      Project,
      Photo,
    ]),
    CatalogModule,
    UsersModule,
    ProjectsModule,
    FieldRecordsModule,
  ],
  controllers: [InsuranceController],
  providers: [InsuranceService, ClaimsService, InsuranceLedgerSync],
  exports: [InsuranceService],
})
export class InsuranceModule {}
