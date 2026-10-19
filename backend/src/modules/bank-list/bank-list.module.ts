import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsModule } from '../projects/projects.module';
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
    ]),
    ProjectsModule,
  ],
  controllers: [BankListController],
  providers: [BankListService],
  exports: [BankListService],
})
export class BankListModule {}
