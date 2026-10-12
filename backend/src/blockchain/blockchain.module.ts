import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChainClock } from './chain-clock';
import { ContractsRegistry } from './contracts.registry';
import { ChainEvent } from './indexer/chain-event.entity';
import { EventHandlerRegistry } from './indexer/event-handler.registry';
import { EventIndexerService } from './indexer/event-indexer.service';
import { IndexerState } from './indexer/indexer-state.entity';
import { ReceiptApplier } from './indexer/receipt-applier';
import { KeyService } from './keys/key.service';
import { TransactionService } from './tx/transaction.service';

/**
 * Connection to the smart contracts: deployed contracts, per-person keys,
 * transactions and the event indexer. Global, since most business modules
 * read from or write to the ledger.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ChainEvent, IndexerState])],
  providers: [
    ContractsRegistry,
    KeyService,
    TransactionService,
    EventHandlerRegistry,
    EventIndexerService,
    ReceiptApplier,
    ChainClock,
  ],
  exports: [
    ContractsRegistry,
    KeyService,
    TransactionService,
    EventHandlerRegistry,
    EventIndexerService,
    ReceiptApplier,
    ChainClock,
  ],
})
export class BlockchainModule {}
