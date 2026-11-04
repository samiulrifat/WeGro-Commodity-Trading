import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankListModule } from '../bank-list/bank-list.module';
import { CatalogModule } from '../catalog/catalog.module';
import { FieldRecordsModule } from '../field-records/field-records.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Project } from '../projects/entities/project.entity';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { WarehouseOperator } from '../warehouse/entities/warehouse-operator.entity';
import { WarehouseReceipt } from '../warehouse/entities/warehouse-receipt.entity';
import { DealExpiryJob } from './deal-expiry.job';
import { DealProofsController } from './deal-proofs.controller';
import { DealProofsService } from './deal-proofs.service';
import { BuyerRequest } from './entities/buyer-request.entity';
import { DealProof } from './entities/deal-proof.entity';
import { DealProofFile } from './entities/deal-proof-file.entity';
import { Delivery } from './entities/delivery.entity';
import { Listing } from './entities/listing.entity';
import { ListingDetails } from './entities/listing-details.entity';
import { Offer } from './entities/offer.entity';
import { RequestsService } from './requests.service';
import { TradeController } from './trade.controller';
import { TradeLedgerSync } from './trade-ledger.sync';
import { TradeService } from './trade.service';

/** The marketplace (TradeLedger): listings, offers, deals, payment proofs, delivery and buyer requests. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Listing,
      ListingDetails,
      Offer,
      DealProof,
      DealProofFile,
      Delivery,
      BuyerRequest,
      Project,
      WarehouseReceipt,
      WarehouseOperator,
    ]),
    CatalogModule,
    UsersModule,
    ProjectsModule,
    FieldRecordsModule,
    BankListModule,
    NotificationsModule,
  ],
  controllers: [TradeController, DealProofsController],
  providers: [
    TradeService,
    RequestsService,
    DealProofsService,
    TradeLedgerSync,
    DealExpiryJob,
  ],
})
export class TradeModule {}
