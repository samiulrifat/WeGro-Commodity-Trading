import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { Project } from '../projects/entities/project.entity';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { BatchesService } from './batches.service';
import { InputBatch } from './entities/input-batch.entity';
import { VoucherSaleBatch } from './entities/voucher-sale-batch.entity';
import { VoucherSale } from './entities/voucher-sale.entity';
import { VoucherSupplier } from './entities/voucher-supplier.entity';
import { Voucher } from './entities/voucher.entity';
import { SaleExpiryJob } from './sale-expiry.job';
import { VoucherLedgerSync } from './voucher-ledger.sync';
import {
  BatchesController,
  VerifyController,
  VouchersController,
} from './vouchers.controller';
import { VouchersService } from './vouchers.service';

/** Input vouchers, supplier batches with QR codes, and sales (VoucherRegistry). */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Voucher,
      VoucherSupplier,
      VoucherSale,
      VoucherSaleBatch,
      InputBatch,
      Project,
    ]),
    CatalogModule,
    UsersModule,
    ProjectsModule,
  ],
  controllers: [VouchersController, BatchesController, VerifyController],
  providers: [
    VouchersService,
    BatchesService,
    VoucherLedgerSync,
    SaleExpiryJob,
  ],
  exports: [VouchersService],
})
export class VouchersModule {}
