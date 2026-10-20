import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { UsersModule } from '../users/users.module';
import { BankListModule } from '../bank-list/bank-list.module';
import { Photo } from '../field-records/entities/photo.entity';
import { PhotosService } from '../field-records/photos.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentProof } from './entities/payment-proof.entity';
import { PaymentProofFile } from './entities/payment-proof-file.entity';
import { Project } from './entities/project.entity';
import { ProjectFavourite } from './entities/project-favourite.entity';
import { Refund } from './entities/refund.entity';
import { Reservation } from './entities/reservation.entity';
import { PaymentProofsController } from './payment-proofs.controller';
import { PaymentProofsService } from './payment-proofs.service';
import { ProofFiles } from './proof-files';
import { ProjectLedgerSync } from './project-ledger.sync';
import { ProjectViews } from './project-views';
import {
  InvestmentsController,
  ProjectsController,
  ReservationsController,
} from './projects.controller';
import { ProjectsService } from './projects.service';
import { ReservationExpiryJob } from './reservation-expiry.job';
import { ReservationsService } from './reservations.service';

/** Projects, slot reservations, payment proofs and confirmation, and refunds (ProjectLedger). */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      Reservation,
      Refund,
      ProjectFavourite,
      PaymentProof,
      PaymentProofFile,
      // Cover photos are stored like field photos.
      Photo,
    ]),
    CatalogModule,
    UsersModule,
    BankListModule,
    NotificationsModule,
  ],
  controllers: [
    ProjectsController,
    ReservationsController,
    InvestmentsController,
    PaymentProofsController,
  ],
  providers: [
    ProjectsService,
    ReservationsService,
    ProjectViews,
    ProjectLedgerSync,
    ReservationExpiryJob,
    PaymentProofsService,
    ProofFiles,
    PhotosService,
  ],
  exports: [ProjectsService, ProjectViews],
})
export class ProjectsModule {}
