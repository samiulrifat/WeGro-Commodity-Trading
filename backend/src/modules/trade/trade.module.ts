import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { FieldRecordsModule } from '../field-records/field-records.module';
import { Project } from '../projects/entities/project.entity';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { WarehouseOperator } from '../warehouse/entities/warehouse-operator.entity';
import { WarehouseReceipt } from '../warehouse/entities/warehouse-receipt.entity';
import { DealExpiryJob } from './deal-expiry.job';
import { BuyerRequest } from './entities/buyer-request.entity';
import { Delivery } from './entities/delivery.entity';
import { Listing } from './entities/listing.entity';
import { ListingDetails } from './entities/listing-details.entity';
import { Offer } from './entities/offer.entity';
import { RequestsService } from './requests.service';
import { TradeController } from './trade.controller';
import { TradeLedgerSync } from './trade-ledger.sync';
import { TradeService } from './trade.service';

/** The marketplace (TradeLedger): listings, offers, deals, delivery and buyer requests. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Listing,
      ListingDetails,
      Offer,
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
  ],
  controllers: [TradeController],
  providers: [TradeService, RequestsService, TradeLedgerSync, DealExpiryJob],
})
export class TradeModule {}
