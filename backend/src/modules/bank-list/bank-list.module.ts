import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { PersonalDetails } from '../users/entities/personal-details.entity';
import { BankListController } from './bank-list.controller';
import { BankListService } from './bank-list.service';
import { BankListImport } from './entities/bank-list-import.entity';
import { ListedBank } from './entities/listed-bank.entity';
import { ListedBranch } from './entities/listed-branch.entity';
import { ListedDistrict } from './entities/listed-district.entity';

/** The official list of banks and branches with their routing numbers. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ListedBank,
      ListedDistrict,
      ListedBranch,
      BankListImport,
      PersonalDetails,
    ]),
    UsersModule,
  ],
  controllers: [BankListController],
  providers: [BankListService],
  exports: [BankListService],
})
export class BankListModule {}
