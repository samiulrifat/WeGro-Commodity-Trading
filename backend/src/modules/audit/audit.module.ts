import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FieldRecordsModule } from '../field-records/field-records.module';
import { ParticipantsModule } from '../participants/participants.module';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { AuditController } from './audit.controller';
import { AuditLog } from './entities/audit-log.entity';
import { VerificationFinding } from './entities/verification-finding.entity';
import { VerificationRun } from './entities/verification-run.entity';
import { HistoryService } from './history/history.service';
import { AuditLogMiddleware } from './log/audit-log.middleware';
import { AuditLogService } from './log/audit-log.service';
import { SweepService } from './verify/sweep.service';
import { VerifyService } from './verify/verify.service';

/** History from the ledger, verification against it, and the write-request log. */
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog, VerificationRun, VerificationFinding]),
    UsersModule,
    ProjectsModule,
    ParticipantsModule,
    FieldRecordsModule,
  ],
  controllers: [AuditController],
  providers: [
    HistoryService,
    VerifyService,
    SweepService,
    AuditLogService,
    AuditLogMiddleware,
  ],
})
export class AuditModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuditLogMiddleware).forRoutes('*');
  }
}
