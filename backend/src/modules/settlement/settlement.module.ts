import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { Photo } from '../field-records/entities/photo.entity';
import { FieldRecordsModule } from '../field-records/field-records.module';
import { Project } from '../projects/entities/project.entity';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { PayoutLine } from './entities/payout-line.entity';
import { ProjectCost } from './entities/project-cost.entity';
import { SettlementRound } from './entities/settlement-round.entity';
import { SettlementReportsService } from './reports.service';
import { SettlementController } from './settlement.controller';
import { SettlementLedgerSync } from './settlement-ledger.sync';
import { SettlementService } from './settlement.service';

/** Settlement (SettlementLedger): costs, payout rounds, payments, reports and statements. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectCost,
      SettlementRound,
      PayoutLine,
      Project,
      Photo,
    ]),
    UsersModule,
    ProjectsModule,
    FieldRecordsModule,
    BankAccountsModule,
  ],
  controllers: [SettlementController],
  providers: [
    SettlementService,
    SettlementReportsService,
    SettlementLedgerSync,
  ],
})
export class SettlementModule {}
