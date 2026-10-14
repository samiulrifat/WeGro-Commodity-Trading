import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { BankAccountsController } from './bank-accounts.controller';
import { BankAccountsService } from './bank-accounts.service';
import { BankAccount } from './entities/bank-account.entity';

/** Payees' bank accounts, verified by an admin before payouts use them. */
@Module({
  imports: [
    TypeOrmModule.forFeature([BankAccount]),
    UsersModule,
    ProjectsModule,
    NotificationsModule,
  ],
  controllers: [BankAccountsController],
  providers: [BankAccountsService],
  exports: [BankAccountsService],
})
export class BankAccountsModule {}
