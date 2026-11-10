import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankListModule } from '../bank-list/bank-list.module';
import { CatalogModule } from '../catalog/catalog.module';
import { Photo } from '../field-records/entities/photo.entity';
import { FieldRecordsModule } from '../field-records/field-records.module';
import { Project } from '../projects/entities/project.entity';
import { ProjectsModule } from '../projects/projects.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { ClaimProofsController } from './claim-proofs.controller';
import { ClaimProofsService } from './claim-proofs.service';
import { ClaimsService } from './claims.service';
import { ClaimProof } from './entities/claim-proof.entity';
import { ClaimProofFile } from './entities/claim-proof-file.entity';
import { CoverageTerms } from './entities/coverage-terms.entity';
import { InsuranceClaim } from './entities/insurance-claim.entity';
import { InsurerAssignment } from './entities/insurer-assignment.entity';
import { WeatherEvent } from './entities/weather-event.entity';
import { InsuranceController } from './insurance.controller';
import { InsuranceLedgerSync } from './insurance-ledger.sync';
import { InsuranceService } from './insurance.service';

/** Crop insurance (InsuranceRegistry): cover, weather events, claims and insurers' payment proofs. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CoverageTerms,
      WeatherEvent,
      InsuranceClaim,
      ClaimProof,
      ClaimProofFile,
      InsurerAssignment,
      Project,
      Photo,
    ]),
    CatalogModule,
    UsersModule,
    ProjectsModule,
    FieldRecordsModule,
    BankListModule,
    NotificationsModule,
  ],
  controllers: [InsuranceController, ClaimProofsController],
  providers: [
    InsuranceService,
    ClaimsService,
    ClaimProofsService,
    InsuranceLedgerSync,
  ],
  exports: [InsuranceService],
})
export class InsuranceModule {}
