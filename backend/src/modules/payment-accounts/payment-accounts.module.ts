import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankListModule } from '../bank-list/bank-list.module';
import { PaymentAccount } from './entities/payment-account.entity';
import { PaymentAccountsController } from './payment-accounts.controller';
import { PaymentAccountsService } from './payment-accounts.service';

/** WeGro's bank accounts that investors pay into. */
@Module({
  imports: [TypeOrmModule.forFeature([PaymentAccount]), BankListModule],
  controllers: [PaymentAccountsController],
  providers: [PaymentAccountsService],
  exports: [PaymentAccountsService],
})
export class PaymentAccountsModule {}
