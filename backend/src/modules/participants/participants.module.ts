import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { DemoAccountsService } from './demo-accounts.service';
import { ParticipantLedgerSync } from './participant-ledger.sync';
import { ParticipantsController } from './participants.controller';
import { ParticipantsService } from './participants.service';

/** Practice ID check, registration and everything AccessRegistry records about people. */
@Module({
  imports: [UsersModule, AuthModule],
  controllers: [ParticipantsController],
  providers: [ParticipantsService, ParticipantLedgerSync, DemoAccountsService],
  exports: [ParticipantsService],
})
export class ParticipantsModule {}
