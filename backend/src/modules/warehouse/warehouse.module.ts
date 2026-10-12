import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { Project } from '../projects/entities/project.entity';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { ReceiptRecheck } from './entities/receipt-recheck.entity';
import { WarehouseOperator } from './entities/warehouse-operator.entity';
import { WarehouseReceipt } from './entities/warehouse-receipt.entity';
import { WarehouseSite } from './entities/warehouse-site.entity';
import {
  ReceiptVerifyController,
  WarehouseController,
} from './warehouse.controller';
import { WarehouseLedgerSync } from './warehouse-ledger.sync';
import { WarehouseService } from './warehouse.service';

/** Warehouse sites, operators and receipts with public QR verification (WarehouseReceipt). */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WarehouseSite,
      WarehouseOperator,
      WarehouseReceipt,
      ReceiptRecheck,
      Project,
    ]),
    CatalogModule,
    UsersModule,
    ProjectsModule,
  ],
  controllers: [WarehouseController, ReceiptVerifyController],
  providers: [WarehouseService, WarehouseLedgerSync],
  exports: [WarehouseService],
})
export class WarehouseModule {}
