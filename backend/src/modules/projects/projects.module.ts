import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { UsersModule } from '../users/users.module';
import { Project } from './entities/project.entity';
import { Refund } from './entities/refund.entity';
import { Reservation } from './entities/reservation.entity';
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

/** Projects, slot reservations, payment confirmation and refunds (ProjectLedger). */
@Module({
  imports: [
    TypeOrmModule.forFeature([Project, Reservation, Refund]),
    CatalogModule,
    UsersModule,
  ],
  controllers: [
    ProjectsController,
    ReservationsController,
    InvestmentsController,
  ],
  providers: [
    ProjectsService,
    ReservationsService,
    ProjectViews,
    ProjectLedgerSync,
    ReservationExpiryJob,
  ],
  exports: [ProjectsService, ProjectViews],
})
export class ProjectsModule {}
