import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { DemoAccountsService } from './demo-accounts.service';
import { DetailChangesController } from './detail-changes.controller';
import { DetailChangesService } from './detail-changes.service';
import { DetailChangeRequest } from './entities/detail-change-request.entity';
import { ParticipantLedgerSync } from './participant-ledger.sync';
import { ParticipantsController } from './participants.controller';
import { ParticipantsService } from './participants.service';

/** Practice ID check, registration and everything AccessRegistry records about people. */
@Module({
  imports: [
    UsersModule,
    AuthModule,
    NotificationsModule,
    TypeOrmModule.forFeature([DetailChangeRequest]),
  ],
  controllers: [ParticipantsController, DetailChangesController],
  providers: [
    ParticipantsService,
    ParticipantLedgerSync,
    DemoAccountsService,
    DetailChangesService,
  ],
  exports: [ParticipantsService],
})
export class ParticipantsModule {}
