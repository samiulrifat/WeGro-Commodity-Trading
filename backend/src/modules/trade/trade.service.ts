import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { ContractTransaction } from 'ethers';
import { randomUUID } from 'node:crypto';
import {
  Brackets,
  In,
  IsNull,
  Not,
  QueryFailedError,
  Repository,
  type SelectQueryBuilder,
} from 'typeorm';
import { ChainClock } from '../../blockchain/chain-clock';
import { ContractsRegistry } from '../../blockchain/contracts.registry';
import { ContractRevertException } from '../../blockchain/errors/contract-errors';
import type { TradeLedger } from '../../blockchain/generated';
import { ReceiptApplier } from '../../blockchain/indexer/receipt-applier';
import { TransactionService } from '../../blockchain/tx/transaction.service';
import { fingerprint } from '../../blockchain/utils/fingerprint';
import { codeToBytes32, uuidToBytes32 } from '../../blockchain/utils/ids';
import { poishaToTaka, takaToPoisha } from '../../blockchain/utils/money';
import {
  hashPaymentRef,
  normalisePaymentRef,
} from '../../blockchain/utils/payment-ref';
import { IdentityCryptoService } from '../../common/crypto/identity-crypto.service';
import { Paginated } from '../../common/dto/pagination.dto';
import {
  matchesWord,
  searchWords,
  wordPattern,
} from '../../common/search/words';
import {
  BD_DISTRICTS,
  isDistrictCode,
} from '../../common/reference/bd-districts';
import { hasContactDetails } from '../../common/text/contact-details';
import { isPastDay } from '../../common/time/bd-dates';
import type { EnvironmentVariables } from '../../config/env.validation';
import type { AuthUser } from '../auth/auth-user';
import { CatalogService } from '../catalog/catalog.service';
import { ProduceCategory } from '../catalog/catalog.enums';
import type { Photo } from '../field-records/entities/photo.entity';
import { photoHash, PhotosService } from '../field-records/photos.service';
import type { ProduceRefDto } from '../projects/dto/project-response.dto';
import { Project } from '../projects/entities/project.entity';
import { ProjectStage } from '../projects/project.enums';
import { ProjectViews } from '../projects/project-views';
import { User } from '../users/entities/user.entity';
import { PersonSearch } from '../users/person-search';
import { actsAs, holdsRole, Role } from '../users/roles';
import { WarehouseOperator } from '../warehouse/entities/warehouse-operator.entity';
import { WarehouseReceipt } from '../warehouse/entities/warehouse-receipt.entity';
import { ReceiptStatus } from '../warehouse/warehouse.enums';
import type {
  ConfirmDeliveryDto,
  DeliveryViewDto,
  FeeScheduleDto,
  ListExternalDto,
  ListingDto,
  ListListingsQueryDto,
  ListOffersQueryDto,
  ListProduceDto,
  ListReceiptDto,
  MakeOfferDto,
  OfferDto,
  SellerDto,
  SetFeeSlabsDto,
} from './dto/trade.dto';
import { Delivery } from './entities/delivery.entity';
import { Listing } from './entities/listing.entity';
import {
  ListingDetails,
  type ListingPhoto,
} from './entities/listing-details.entity';
import { Offer } from './entities/offer.entity';
import {
  DeliverySide,
  ListingStatus,
  OfferSide,
  OfferStatus,
} from './trade.enums';
import { ErrorCode } from '../../common/errors/error-code';

const STAFF: ReadonlySet<Role> = new Set([
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.OPERATIONS,
  Role.ACCOUNTS,
  Role.AUDITOR,
]);
/** Listing statuses only staff and the listing's own seller see. */
const HIDDEN: ReadonlySet<ListingStatus> = new Set([
  ListingStatus.PENDING,
  ListingStatus.REJECTED,
]);
/**
 * WeGro's people handing goods over know every buyer; a buyer knows only
 * themselves, and the seller's side never does.
 */
const SEES_BUYERS: ReadonlySet<Role> = new Set([
  ...STAFF,
  Role.FIELD_OFFICER,
  Role.WAREHOUSE,
]);
const SEES_PAYMENTS: ReadonlySet<Role> = new Set([
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.ACCOUNTS,
  Role.AUDITOR,
]);

/**
 * The marketplace (TradeLedger): listings, offers and deals, buyer payment
 * and delivery. Each action checks the ledger's rules first for a precise
 * error; the contract checks again and has the final word.
 */
@Injectable()
export class TradeService {
  private readonly paymentRefSecret: string;

  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    @InjectRepository(Listing) private readonly listings: Repository<Listing>,
    @InjectRepository(ListingDetails)
    private readonly details: Repository<ListingDetails>,
    @InjectRepository(Offer) private readonly offers: Repository<Offer>,
    @InjectRepository(Delivery)
    private readonly deliveries: Repository<Delivery>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(WarehouseReceipt)
    private readonly receipts: Repository<WarehouseReceipt>,
    @InjectRepository(WarehouseOperator)
    private readonly operators: Repository<WarehouseOperator>,
    private readonly catalog: CatalogService,
    private readonly views: ProjectViews,
    private readonly photos: PhotosService,
    private readonly crypto: IdentityCryptoService,
    private readonly tx: TransactionService,
    private readonly applier: ReceiptApplier,
    private readonly contracts: ContractsRegistry,
    private readonly clock: ChainClock,
    private readonly search: PersonSearch,
  ) {
    this.paymentRefSecret = config.get('PAYMENT_REF_SECRET', { infer: true });
  }

  // --- Listings ---

  /** Lists a warehouse receipt: an admin for WeGro's, the farmer's officer for the farmer's. */
  async listReceipt(actor: AuthUser, dto: ListReceiptDto): Promise<ListingDto> {
    const receiptId = dto.receiptId.toLowerCase();
    const receipt = await this.receipts.findOneBy({ id: receiptId });
    if (!receipt || receipt.status === ReceiptStatus.SUBMITTED) {
      throw new NotFoundException({
        message: 'Receipt not found',
        code: ErrorCode.RECEIPT_NOT_FOUND,
      });
    }
    const ownerSide = receipt.ownerIsWegro
      ? actsAs(actor.role, Role.ADMIN)
      : !!receipt.ownerId && (await this.isOfficerOf(actor, receipt.ownerId));
    if (!ownerSide)
      throw new ForbiddenException({
        message: "Only the receipt owner's side can list it",
        code: ErrorCode.NOT_RECEIPT_OWNER,
      });
    if (receipt.status !== ReceiptStatus.ISSUED) {
      throw new ConflictException({
        message: `Only an issued receipt can be listed; this one is ${receipt.status}`,
        code: ErrorCode.RECEIPT_NOT_ISSUED,
        details: { status: receipt.status },
      });
    }
    if (isPastDay(receipt.expiresOn, await this.clock.now())) {
      throw new ConflictException({
        message:
          'This receipt has expired; the site must re-check and extend it first',
        code: ErrorCode.RECEIPT_EXPIRED,
      });
    }
    // Crop WeGro bought back is its own: it sells whatever the project's stage.
    if (receipt.buyBackUnitPrice == null) {
      await this.requireActive(receipt.projectId);
    }
    const result = await this.send(actor, (c) =>
      c.listReceipt.populateTransaction(
        receiptId,
        takaToPoisha(dto.askingUnitPrice),
      ),
    );
    return this.listingOne(
      Number(
        result.events.find((e) => e.name === 'ListingCreated')!.args.listingId,
      ),
      actor,
    );
  }

  /** Fresh produce straight from a project: as WeGro (admin) or for the farmer (their officer). */
  async listProduce(actor: AuthUser, dto: ListProduceDto): Promise<ListingDto> {
    const project = await this.requireActive(dto.projectId);
    if (project.category !== (ProduceCategory.PERISHABLE as string)) {
      throw new UnprocessableEntityException({
        message:
          'Stored crops and spices are sold through their warehouse receipts',
        code: ErrorCode.NOT_PERISHABLE,
      });
    }
    if (
      !actsAs(actor.role, Role.ADMIN) &&
      !(await this.isOfficerOf(actor, project.farmerId))
    ) {
      throw new ForbiddenException({
        message: "Only an admin or the farmer's field officer can list this",
        code: ErrorCode.LISTING_NOT_ALLOWED,
      });
    }
    const result = await this.send(actor, (c) =>
      c.listProduce.populateTransaction(
        uuidToBytes32(dto.projectId),
        dto.quantity,
        takaToPoisha(dto.askingUnitPrice),
      ),
    );
    return this.listingOne(
      Number(
        result.events.find((e) => e.name === 'ListingCreated')!.args.listingId,
      ),
      actor,
    );
  }

  /**
   * An external seller lists produce of their own: saved here with its
   * photos and description, its fingerprint on the ledger. Buyers see it
   * once an admin approves it.
   */
  async listExternal(
    actor: AuthUser,
    dto: ListExternalDto,
  ): Promise<ListingDto> {
    this.catalog.produceTypes.requireActive(dto.produceCode);
    if (dto.description) refuseContactDetails(dto.description);
    const photos: ListingPhoto[] = [];
    for (const id of dto.photoIds) {
      const photo = await this.photos.find(id).catch(() => null);
      if (!photo || photo.uploadedById !== actor.id) {
        throw new UnprocessableEntityException({
          message: 'photoIds must be photos you uploaded',
          code: ErrorCode.PHOTO_NOT_YOURS,
        });
      }
      photos.push({ id: photo.id, hash: photoHash(photo.sha256) });
    }
    const row = this.details.create({
      id: randomUUID(),
      sellerId: actor.id,
      produceCode: dto.produceCode,
      quantity: dto.quantity,
      askingUnitPrice: takaToPoisha(dto.askingUnitPrice),
      districtCode: dto.districtCode,
      description: dto.description ?? null,
      photos,
      listingId: null,
    });
    row.detailsHash = listingFingerprint(row);
    await this.details.insert(row);
    let result: Awaited<ReturnType<TradeService['send']>>;
    try {
      result = await this.send(actor, (c) =>
        c.listExternal.populateTransaction(
          codeToBytes32(dto.produceCode),
          dto.quantity,
          row.askingUnitPrice,
          row.detailsHash,
        ),
      );
    } catch (error) {
      if (error instanceof ContractRevertException)
        await this.details.delete({ id: row.id });
      throw error;
    }
    return this.listingOne(
      Number(
        result.events.find((e) => e.name === 'ListingCreated')!.args.listingId,
      ),
      actor,
    );
  }

  /** An admin lets an external seller's listing go live. */
  async approveListing(actor: AuthUser, id: number): Promise<ListingDto> {
    await this.pendingListing(id);
    await this.send(actor, (c) => c.approveListing.populateTransaction(id));
    return this.listingOne(id, actor);
  }

  /** An admin turns an external seller's listing down, saying why. */
  async rejectListing(
    actor: AuthUser,
    id: number,
    reason: string,
  ): Promise<ListingDto> {
    await this.pendingListing(id);
    await this.send(actor, (c) => c.rejectListing.populateTransaction(id));
    await this.listings.update({ id }, { rejectReason: reason });
    return this.listingOne(id, actor);
  }

  /** Stops selling what is left; unpaid deals must be cancelled or expire first. */
  async cancelListing(actor: AuthUser, id: number): Promise<ListingDto> {
    const listing = await this.listingIn(id, [
      ListingStatus.OPEN,
      ListingStatus.PENDING,
    ]);
    if (
      !actsAs(actor.role, Role.ADMIN) &&
      !(await this.isSellerSide(actor, listing))
    ) {
      throw new ForbiddenException({
        message: 'Only the seller side or an admin can cancel this listing',
        code: ErrorCode.LISTING_CANCEL_NOT_ALLOWED,
      });
    }
    if (listing.unpaidDeals > 0) {
      throw new ConflictException({
        message: `${listing.unpaidDeals} approved deal(s) are waiting for payment`,
        code: ErrorCode.DEALS_PENDING,
        details: { unpaidDeals: listing.unpaidDeals },
      });
    }
    await this.send(actor, (c) => c.cancelListing.populateTransaction(id));
    return this.listingOne(id, actor);
  }

  /**
   * Open listings for everyone; a seller's own in every status (`mine`);
   * those waiting for approval or turned down only for staff. Searched by
   * produce or project words, or the seller as a person.
   */
  async listListings(
    actor: AuthUser,
    q: ListListingsQueryDto,
  ): Promise<Paginated<ListingDto>> {
    const qb = this.listings
      .createQueryBuilder('l')
      .where('l.status IS NOT NULL');
    if (q.mine) {
      qb.andWhere('l.seller_id = :me AND l.project_id IS NULL', {
        me: actor.id,
      });
      if (q.status) qb.andWhere('l.status = :st', { st: q.status });
    } else {
      const status = q.status ?? ListingStatus.OPEN;
      if (HIDDEN.has(status) && !STAFF.has(actor.role)) {
        qb.andWhere('FALSE');
      }
      qb.andWhere('l.status = :st', { st: status });
    }
    if (q.produceCode)
      qb.andWhere('l.produce_code = :pc', { pc: q.produceCode });
    if (q.projectId) {
      // Someone who can also invest sees projects: asking by project would
      // tell them which farmer a listing is from.
      qb.andWhere(
        holdsRole(actor, Role.BUYER) || holdsRole(actor, Role.SELLER)
          ? 'FALSE'
          : 'l.project_id = :pid',
        { pid: q.projectId },
      );
    }
    if (q.source === 'warehouse') qb.andWhere('l.receipt_id IS NOT NULL');
    if (q.source === 'fresh') {
      qb.andWhere('l.receipt_id IS NULL AND l.project_id IS NOT NULL');
    }
    if (q.source === 'seller') qb.andWhere('l.project_id IS NULL');
    if (q.districtCode) {
      qb.andWhere(
        `(EXISTS (SELECT 1 FROM projects p WHERE p.id = l.project_id AND p.district_code = :dc)
          OR EXISTS (SELECT 1 FROM listing_details d WHERE d.id = l.details_id AND d.district_code = :dc))`,
        { dc: q.districtCode },
      );
    }
    this.searchListings(actor, qb, q.q);
    const [rows, total] = await qb
      .orderBy('l.created_at', 'DESC')
      .addOrderBy('l.id', 'DESC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    return new Paginated(await this.listingDtos(actor, rows), total, q);
  }

  /** A listing; one waiting for approval or turned down only for staff and its seller. */
  async listingOne(id: number, actor: AuthUser): Promise<ListingDto> {
    return (
      await this.listingDtos(actor, [await this.visibleListing(id, actor)])
    )[0];
  }

  /** A photo of an external listing, for whoever may see the listing. */
  async listingPhoto(
    actor: AuthUser,
    id: number,
    index: number,
  ): Promise<Photo> {
    const listing = await this.visibleListing(id, actor);
    const details = listing.detailsId
      ? await this.details.findOneBy({ id: listing.detailsId })
      : null;
    const photo = details?.photos[index];
    if (!photo)
      throw new NotFoundException({
        message: 'No such photo',
        code: ErrorCode.LISTING_NOT_FOUND,
      });
    return this.photos.find(photo.id);
  }

  // --- Platform fees ---

  /** The slabs as the ledger has them now: one read, always current. */
  async feeSchedule(): Promise<FeeScheduleDto> {
    const [caps, fees] = await this.ledger().getFeeSlabs();
    return {
      slabs: fees.map((fee, i) => ({
        upTo: i < caps.length ? poishaToTaka(caps[i]) : null,
        fee: poishaToTaka(fee),
      })),
    };
  }

  /** The super admin sets the slabs; deals already approved keep their fees. */
  async setFeeSchedule(
    actor: AuthUser,
    dto: SetFeeSlabsDto,
  ): Promise<FeeScheduleDto> {
    const last = dto.slabs[dto.slabs.length - 1];
    const caps = dto.slabs
      .slice(0, -1)
      .map((x) => (x.upTo ? takaToPoisha(x.upTo) : 0n));
    const rising = caps.every((c, i) => c > 0n && (i === 0 || c > caps[i - 1]));
    if (!rising || (last.upTo !== undefined && last.upTo !== null)) {
      throw new UnprocessableEntityException({
        message:
          'Each slab but the last needs a cap above the one before; the last has none',
        code: ErrorCode.FEE_SLABS_INVALID,
      });
    }
    const fees = dto.slabs.map((x) => takaToPoisha(x.fee));
    await this.send(actor, (c) =>
      c.setFeeSlabs.populateTransaction(caps, fees),
    );
    return this.feeSchedule();
  }

  // --- Offers and deals ---

  async makeOffer(
    actor: AuthUser,
    listingId: number,
    dto: MakeOfferDto,
  ): Promise<OfferDto> {
    const listing = await this.openListing(listingId);
    if (listing.sellerId === actor.id) {
      throw new ConflictException({
        message: 'This is your own listing',
        code: ErrorCode.OWN_LISTING,
      });
    }
    if (dto.quantity > listing.available) {
      throw new ConflictException({
        message: `Only ${listing.available} available`,
        code: ErrorCode.EXCEEDS_AVAILABLE,
        details: { available: listing.available },
      });
    }
    const result = await this.send(actor, (c) =>
      c.makeOffer.populateTransaction(
        listingId,
        dto.quantity,
        takaToPoisha(dto.unitPrice),
      ),
    );
    return this.offerOne(
      actor,
      Number(result.events.find((e) => e.name === 'OfferMade')!.args.offerId),
    );
  }

  async withdrawOffer(actor: AuthUser, id: number): Promise<OfferDto> {
    const offer = await this.offerIn(id, [OfferStatus.PENDING]);
    if (offer.buyerId !== actor.id)
      throw new NotFoundException({
        message: 'Offer not found',
        code: ErrorCode.OFFER_NOT_FOUND,
      });
    await this.send(actor, (c) => c.withdrawOffer.populateTransaction(id));
    return this.offerOne(actor, id);
  }

  async rejectOffer(actor: AuthUser, id: number): Promise<OfferDto> {
    const offer = await this.offerIn(id, [OfferStatus.PENDING]);
    this.requireDecider(
      actor,
      await this.listings.findOneByOrFail({ id: offer.listingId }),
    );
    await this.send(actor, (c) => c.rejectOffer.populateTransaction(id));
    return this.offerOne(actor, id);
  }

  /** The offer becomes a deal: its quantity is reserved until paid or past its deadline. */
  async approveOffer(actor: AuthUser, id: number): Promise<OfferDto> {
    const offer = await this.offerIn(id, [OfferStatus.PENDING]);
    const listing = await this.openListing(offer.listingId);
    this.requireDecider(actor, listing);
    if (offer.quantity > listing.available) {
      throw new ConflictException({
        message: `Only ${listing.available} still available`,
        code: ErrorCode.EXCEEDS_AVAILABLE,
        details: { available: listing.available },
      });
    }
    await this.send(actor, (c) => c.approveOffer.populateTransaction(id));
    return this.offerOne(actor, id);
  }

  async cancelDeal(actor: AuthUser, id: number): Promise<OfferDto> {
    await this.offerIn(id, [OfferStatus.APPROVED]);
    await this.send(actor, (c) => c.cancelDeal.populateTransaction(id));
    return this.offerOne(actor, id);
  }

  /**
   * Accounts confirms a deal paid without proofs in the app (proofs are
   * accepted one by one instead, which confirms the deal when they add up).
   */
  async confirmPayment(
    actor: AuthUser,
    id: number,
    paymentReference: string,
  ): Promise<OfferDto> {
    let ref: string;
    try {
      ref = normalisePaymentRef(paymentReference);
    } catch (error) {
      throw new UnprocessableEntityException({
        message: (error as Error).message,
        code: ErrorCode.PAYMENT_REF_INVALID,
      });
    }
    const { paid, underReview } = (await this.payments([id])).get(id) ?? NONE;
    if (paid > 0n || underReview > 0n) {
      throw new ConflictException({
        message: 'This deal has payment proofs: review them instead',
        code: ErrorCode.DEAL_PROOFS_TO_REVIEW,
      });
    }
    return this.confirmWith(actor, id, ref);
  }

  /**
   * The buyer paid, before the deadline or with the clock stopped. The
   * reference (already normalised; several proofs' are combined by the
   * caller) is saved encrypted first, with only one confirmation in flight
   * per deal; the ledger gets its keyed hash and refuses to accept it twice.
   * For a receipt, the bought quantity splits off to the buyer.
   */
  async confirmWith(
    actor: AuthUser,
    id: number,
    ref: string,
  ): Promise<OfferDto> {
    const hash = hashPaymentRef(ref, this.paymentRefSecret);
    const offer = await this.offerIn(id, [OfferStatus.APPROVED]);
    if (
      offer.pausedRemaining === null &&
      offer.paymentDueAt &&
      offer.paymentDueAt <= (await this.clock.now())
    ) {
      throw new ConflictException({
        message: 'The payment deadline for this deal has passed',
        code: ErrorCode.PAYMENT_OVERDUE,
      });
    }
    try {
      const saved = await this.offers
        .createQueryBuilder()
        .update()
        .set({
          paymentRefEnc: this.crypto.encrypt(ref, offerContext(id)),
          paymentRefHash: hash,
          paidConfirmedById: actor.id,
        })
        .where("id = :id AND status = 'approved'", { id })
        .andWhere('(payment_ref_hash IS NULL OR payment_ref_hash = :hash)', {
          hash,
        })
        .execute();
      if (saved.affected !== 1)
        throw new ConflictException({
          message: 'This deal is already being confirmed',
          code: ErrorCode.DEAL_CONFIRMING,
        });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        throw new ConflictException({
          message: 'This payment reference was already used',
          code: ErrorCode.PAYMENT_REF_ALREADY_USED,
        });
      }
      throw error;
    }
    try {
      await this.send(actor, (c) =>
        c.confirmBuyerPayment.populateTransaction(id, hash),
      );
    } catch (error) {
      if (error instanceof ContractRevertException) {
        await this.offers.update(
          { id, paymentRefHash: hash, status: OfferStatus.APPROVED },
          {
            paymentRefEnc: null,
            paymentRefHash: null,
            paidConfirmedById: null,
          },
        );
      }
      throw error;
    }
    return this.offerOne(actor, id);
  }

  /** Accepted and under-review money per deal, in one query. */
  async payments(
    ids: number[],
  ): Promise<Map<number, { paid: bigint; underReview: bigint }>> {
    if (ids.length === 0) return new Map();
    const rows: Array<{
      offer_id: string;
      paid: string;
      review: string;
    }> = await this.offers.query(
      `SELECT offer_id,
                COALESCE(SUM(amount) FILTER (WHERE status = 'accepted'), 0) AS paid,
                COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS review
           FROM deal_proofs
          WHERE offer_id = ANY($1::bigint[])
          GROUP BY offer_id`,
      [ids],
    );
    return new Map(
      rows.map((r) => [
        Number(r.offer_id),
        { paid: BigInt(r.paid), underReview: BigInt(r.review) },
      ]),
    );
  }

  /** Stops the clock with the buyer's own key, as their proof arrives. */
  async pauseOnLedger(actor: AuthUser, id: number): Promise<void> {
    await this.send(actor, (c) => c.pauseDeal.populateTransaction(id));
  }

  /** Accounts restarts the clock once no proof is under review. */
  async resumeOnLedger(actor: AuthUser, id: number): Promise<void> {
    await this.send(actor, (c) => c.resumeDeal.populateTransaction(id));
  }

  /**
   * Accounts paid an external seller for a delivered deal: the amount less
   * the seller fee. The reference is kept encrypted; the ledger gets its
   * keyed hash and refuses one used before.
   */
  async recordSellerPayout(
    actor: AuthUser,
    id: number,
    paymentReference: string,
  ): Promise<OfferDto> {
    let ref: string;
    try {
      ref = normalisePaymentRef(paymentReference);
    } catch (error) {
      throw new UnprocessableEntityException({
        message: (error as Error).message,
        code: ErrorCode.PAYMENT_REF_INVALID,
      });
    }
    const hash = hashPaymentRef(ref, this.paymentRefSecret);
    const offer = await this.offerIn(id, [OfferStatus.DELIVERED]);
    const listing = await this.listings.findOneByOrFail({
      id: offer.listingId,
    });
    if (listing.projectId !== null) {
      throw new ConflictException({
        message: "Only an external seller's deal is paid out to its seller",
        code: ErrorCode.NOT_EXTERNAL_DEAL,
      });
    }
    try {
      const saved = await this.offers
        .createQueryBuilder()
        .update()
        .set({
          sellerPayoutRefEnc: this.crypto.encrypt(ref, payoutContext(id)),
          sellerPayoutRefHash: hash,
          sellerPaidById: actor.id,
        })
        .where("id = :id AND status = 'delivered'", { id })
        .andWhere(
          '(seller_payout_ref_hash IS NULL OR seller_payout_ref_hash = :hash)',
          { hash },
        )
        .execute();
      if (saved.affected !== 1)
        throw new ConflictException({
          message: 'This payout is already being recorded',
          code: ErrorCode.DEAL_CONFIRMING,
        });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        throw new ConflictException({
          message: 'This payment reference was already used',
          code: ErrorCode.PAYMENT_REF_ALREADY_USED,
        });
      }
      throw error;
    }
    try {
      await this.send(actor, (c) =>
        c.recordSellerPayout.populateTransaction(id, hash),
      );
    } catch (error) {
      if (error instanceof ContractRevertException) {
        await this.offers.update(
          { id, sellerPayoutRefHash: hash, status: OfferStatus.DELIVERED },
          {
            sellerPayoutRefEnc: null,
            sellerPayoutRefHash: null,
            sellerPaidById: null,
          },
        );
      }
      throw error;
    }
    return this.offerOne(actor, id);
  }

  /**
   * The buyer, or the handler (an operator of the receipt's warehouse site;
   * the farmer's field officer for fresh produce; the external seller), confirms quantity and
   * condition. Both recorded: delivered. Mismatching quantities are recorded
   * as given and flagged; the ledger counts the deal at its agreed quantity.
   */
  async confirmDelivery(
    actor: AuthUser,
    id: number,
    dto: ConfirmDeliveryDto,
  ): Promise<OfferDto> {
    if (dto.notes) refuseContactDetails(dto.notes);
    const offer = await this.offerIn(id, [OfferStatus.PAID]);
    const listing = await this.listings.findOneByOrFail({
      id: offer.listingId,
    });
    const side =
      holdsRole(actor, Role.BUYER) && offer.buyerId === actor.id
        ? DeliverySide.BUYER
        : (await this.isHandler(actor, listing))
          ? DeliverySide.HANDLER
          : null;
    if (!side)
      throw new ForbiddenException({
        message: 'Only the buyer or the handler confirms delivery',
        code: ErrorCode.DELIVERY_CONFIRM_NOT_ALLOWED,
      });
    if (
      await this.deliveries.exists({
        where: { offerId: id, side, status: 'recorded' },
      })
    ) {
      throw new ConflictException({
        message: `The ${side} has already confirmed this delivery`,
        code: ErrorCode.DELIVERY_ALREADY_CONFIRMED,
        details: { side },
      });
    }

    let photo: Photo | null = null;
    if (dto.photoId) {
      photo = await this.photos.find(dto.photoId).catch(() => null);
      if (!photo || photo.uploadedById !== actor.id) {
        throw new UnprocessableEntityException({
          message: 'photoId must be a photo you uploaded',
          code: ErrorCode.PHOTO_NOT_YOURS,
        });
      }
    }
    const delivery = this.deliveries.create({
      offerId: id,
      side,
      quantity: dto.quantity,
      notes: dto.notes ?? null,
      photoId: photo?.id ?? null,
      photoHash: photo ? photoHash(photo.sha256) : null,
      confirmedById: actor.id,
      status: 'submitted',
      recordedAt: null,
    });
    delivery.qualityHash = deliveryFingerprint(delivery);
    // A previous attempt that never reached the ledger is replaced.
    await this.deliveries.delete({ offerId: id, side, status: 'submitted' });
    await this.deliveries.insert(delivery);
    try {
      await this.send(actor, (c) =>
        c.confirmDelivery.populateTransaction(
          id,
          dto.quantity,
          delivery.qualityHash,
        ),
      );
    } catch (error) {
      if (error instanceof ContractRevertException) {
        await this.deliveries.delete({
          offerId: id,
          side,
          status: 'submitted',
        });
      }
      throw error;
    }
    return this.offerOne(actor, id);
  }

  async listOffers(
    actor: AuthUser,
    q: ListOffersQueryDto,
  ): Promise<Paginated<OfferDto>> {
    const qb = this.offers
      .createQueryBuilder('o')
      .innerJoin(Listing, 'l', 'l.id = o.listing_id')
      .where('o.status IS NOT NULL');
    await this.scopeOffers(actor, qb, q.side);
    if (q.listingId) qb.andWhere('o.listing_id = :lid', { lid: q.listingId });
    if (q.status) qb.andWhere('o.status = :st', { st: q.status });
    if (q.discrepancy) {
      // Both sides agree with the deal exactly when neither differs from it.
      qb.andWhere(
        'EXISTS (SELECT 1 FROM deliveries d WHERE d.offer_id = o.id AND d.quantity <> o.quantity)',
      );
    }
    if (q.payoutDue) {
      qb.andWhere("o.status = 'delivered' AND l.project_id IS NULL");
    }
    this.searchOffers(actor, qb, q.q);
    const [rows, total] = await qb
      .orderBy('o.id', 'DESC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    return new Paginated(await this.offerDtos(actor, rows), total, q);
  }

  async offerOne(actor: AuthUser, id: number): Promise<OfferDto> {
    const qb = this.offers
      .createQueryBuilder('o')
      .innerJoin(Listing, 'l', 'l.id = o.listing_id')
      .where('o.id = :id AND o.status IS NOT NULL', { id });
    await this.scopeOffers(actor, qb);
    const offer = await qb.getOne();
    if (!offer)
      throw new NotFoundException({
        message: 'Offer not found',
        code: ErrorCode.OFFER_NOT_FOUND,
      });
    return (await this.offerDtos(actor, [offer]))[0];
  }

  /** The photo a side attached to its delivery confirmation. */
  async deliveryPhoto(
    actor: AuthUser,
    id: number,
    side: DeliverySide,
  ): Promise<Photo> {
    await this.offerOne(actor, id);
    const delivery = await this.deliveries.findOneBy({ offerId: id, side });
    if (!delivery?.photoId)
      throw new NotFoundException({
        message: 'No photo for this delivery',
        code: ErrorCode.DELIVERY_HAS_NO_PHOTO,
      });
    return this.photos.find(delivery.photoId);
  }

  // --- Rules ---

  private async requireActive(projectId: string): Promise<Project> {
    const project = await this.projects.findOneBy({ id: projectId });
    if (!project)
      throw new NotFoundException({
        message: 'Project not found',
        code: ErrorCode.PROJECT_NOT_FOUND,
      });
    if (project.stage !== ProjectStage.ACTIVE) {
      throw new ConflictException({
        message: 'Produce is sold only while the project is active',
        code: ErrorCode.PROJECT_NOT_ACTIVE,
      });
    }
    return project;
  }

  private async openListing(id: number): Promise<Listing> {
    return this.listingIn(id, [ListingStatus.OPEN]);
  }

  private async pendingListing(id: number): Promise<Listing> {
    return this.listingIn(id, [ListingStatus.PENDING]);
  }

  private async listingIn(
    id: number,
    allowed: ListingStatus[],
  ): Promise<Listing> {
    const listing = await this.listings.findOneBy({ id });
    if (!listing || listing.status === null)
      throw new NotFoundException({
        message: 'Listing not found',
        code: ErrorCode.LISTING_NOT_FOUND,
      });
    if (!allowed.includes(listing.status)) {
      throw new ConflictException({
        message: `This listing is ${listing.status}`,
        code: ErrorCode.LISTING_WRONG_STATUS,
        details: { status: listing.status },
      });
    }
    return listing;
  }

  /** Waiting for approval or turned down: only staff and its own seller see it. */
  private async visibleListing(id: number, actor: AuthUser): Promise<Listing> {
    const listing = await this.listings.findOneBy({ id });
    const hidden =
      !!listing?.status &&
      HIDDEN.has(listing.status) &&
      !STAFF.has(actor.role) &&
      listing.sellerId !== actor.id;
    if (!listing || listing.status === null || hidden)
      throw new NotFoundException({
        message: 'Listing not found',
        code: ErrorCode.LISTING_NOT_FOUND,
      });
    return listing;
  }

  /** Offers on WeGro's listings are decided by an admin; on a seller's, by that seller. */
  private requireDecider(actor: AuthUser, l: Listing): void {
    const allowed =
      l.projectId === null
        ? holdsRole(actor, Role.SELLER) && l.sellerId === actor.id
        : actsAs(actor.role, Role.ADMIN);
    if (!allowed)
      throw new ForbiddenException({
        message:
          "Offers are decided by WeGro's admins, or by the seller on their own listing",
        code: ErrorCode.OFFER_DECIDE_NOT_ALLOWED,
      });
  }

  /**
   * Produce words for everyone; project words or the seller as a person only
   * for WeGro's side (a match would tell a buyer who a seller is).
   */
  private searchListings(
    actor: AuthUser,
    qb: SelectQueryBuilder<Listing>,
    q?: string,
  ): void {
    const text = (q ?? '').trim();
    if (!text) return;
    const office = STAFF.has(actor.role) || actor.role === Role.FIELD_OFFICER;
    const words = searchWords(text);
    const codes = this.catalog.produceTypes
      .list(true)
      .filter((p) =>
        words.every((w) => matchesWord(p.name, w) || matchesWord(p.nameBn, w)),
      )
      .map((p) => p.code);
    const seller = office
      ? this.search.condition('l.seller_id', text, 'Seller')
      : null;
    qb.andWhere(
      new Brackets((b) => {
        b.where('1 = 0');
        if (words.length > 0 && codes.length > 0) {
          b.orWhere('l.produce_code IN (:...qcodes)', { qcodes: codes });
        }
        if (office && words.length > 0) {
          b.orWhere(
            `l.project_id IN (SELECT p.id FROM projects p WHERE ${words
              .map((_, i) => `p.title ~* :lw${i}`)
              .join(' AND ')})`,
            Object.fromEntries(words.map((w, i) => [`lw${i}`, wordPattern(w)])),
          );
        }
        if (seller) b.orWhere(seller.sql, seller.params);
      }),
    );
  }

  /**
   * The offer number (#12) and produce words for everyone; the buyer or
   * seller as a person only for those who may know them (a match would
   * otherwise confirm who the other side is).
   */
  private searchOffers(
    actor: AuthUser,
    qb: SelectQueryBuilder<Offer>,
    q?: string,
  ): void {
    const text = (q ?? '').trim();
    if (!text) return;
    const number = /^#?(\d{1,12})$/.exec(text);
    const words = searchWords(text);
    const codes = this.catalog.produceTypes
      .list(true)
      .filter((p) =>
        words.every((w) => matchesWord(p.name, w) || matchesWord(p.nameBn, w)),
      )
      .map((p) => p.code);
    const buyer = SEES_BUYERS.has(actor.role)
      ? this.search.condition('o.buyer_id', text, 'Buyer')
      : null;
    const seller =
      STAFF.has(actor.role) || actor.role === Role.FIELD_OFFICER
        ? this.search.condition('l.seller_id', text, 'Seller')
        : null;
    qb.andWhere(
      new Brackets((b) => {
        b.where('1 = 0');
        if (number) b.orWhere('o.id = :ono', { ono: Number(number[1]) });
        if (words.length > 0 && codes.length > 0) {
          b.orWhere('l.produce_code IN (:...ocodes)', { ocodes: codes });
        }
        if (buyer) b.orWhere(buyer.sql, buyer.params);
        if (seller) b.orWhere(seller.sql, seller.params);
      }),
    );
  }

  private async offerIn(id: number, allowed: OfferStatus[]): Promise<Offer> {
    const offer = await this.offers.findOneBy({ id });
    if (!offer || offer.status === null)
      throw new NotFoundException({
        message: 'Offer not found',
        code: ErrorCode.OFFER_NOT_FOUND,
      });
    if (!allowed.includes(offer.status))
      throw new ConflictException({
        message: `This offer is ${offer.status}`,
        code: ErrorCode.OFFER_WRONG_STATUS,
        details: { status: offer.status },
      });
    return offer;
  }

  private async isOfficerOf(
    actor: AuthUser,
    farmerId: string,
  ): Promise<boolean> {
    if (actor.role !== Role.FIELD_OFFICER) return false;
    return this.users.exists({
      where: { id: farmerId, fieldOfficerId: actor.id },
    });
  }

  private async isSellerSide(actor: AuthUser, l: Listing): Promise<boolean> {
    if (l.projectId === null) {
      return holdsRole(actor, Role.SELLER) && l.sellerId === actor.id;
    }
    return l.sellerIsWegro
      ? actsAs(actor.role, Role.ADMIN)
      : this.isOfficerOf(actor, l.farmerId!);
  }

  /**
   * Receipt: an operator of the issuing site. Fresh produce: the farmer's
   * officer. External: the seller.
   */
  private async isHandler(actor: AuthUser, l: Listing): Promise<boolean> {
    if (l.projectId === null) {
      return holdsRole(actor, Role.SELLER) && l.sellerId === actor.id;
    }
    if (!l.receiptId) return this.isOfficerOf(actor, l.farmerId!);
    if (actor.role !== Role.WAREHOUSE) return false;
    const [receipt, operator] = await Promise.all([
      this.receipts.findOne({
        where: { id: l.receiptId },
        select: { id: true, siteId: true },
      }),
      this.operators.findOne({
        where: { operatorId: actor.id, siteId: Not(IsNull()) },
      }),
    ]);
    return !!receipt && operator?.siteId === receipt.siteId;
  }

  /**
   * Staff see every offer; buyers their own; sellers' sides and handlers the
   * offers on listings they sell or hand over. Someone who both buys and sells
   * sees both, or the one `side` asked for.
   */
  private async scopeOffers(
    actor: AuthUser,
    qb: SelectQueryBuilder<Offer>,
    side?: OfferSide,
  ): Promise<void> {
    if (STAFF.has(actor.role)) return;
    const buyer = holdsRole(actor, Role.BUYER);
    const seller = holdsRole(actor, Role.SELLER);
    if (buyer || seller) {
      const mine = [
        ...(buyer && side !== OfferSide.SELLING ? ['o.buyer_id = :me'] : []),
        ...(seller && side !== OfferSide.BUYING
          ? ['(l.seller_id = :me AND l.project_id IS NULL)']
          : []),
      ];
      qb.andWhere(mine.length ? `(${mine.join(' OR ')})` : 'FALSE', {
        me: actor.id,
      });
      return;
    }
    switch (actor.role) {
      case Role.FARMER:
        qb.andWhere('l.farmer_id = :me', { me: actor.id });
        return;
      case Role.FIELD_OFFICER:
        qb.andWhere(
          'EXISTS (SELECT 1 FROM users f WHERE f.id = l.farmer_id AND f.field_officer_id = :me)',
          {
            me: actor.id,
          },
        );
        return;
      case Role.WAREHOUSE:
        qb.andWhere(
          `EXISTS (SELECT 1 FROM warehouse_receipts r JOIN warehouse_operators w ON w.site_id = r.site_id
                    WHERE r.id = l.receipt_id AND w.operator_id = :me)`,
          { me: actor.id },
        );
        return;
      default:
        qb.andWhere('FALSE');
    }
  }

  private ledger(): TradeLedger {
    return this.contracts.get('TradeLedger');
  }

  private async send(
    actor: AuthUser,
    build: (c: TradeLedger) => Promise<ContractTransaction>,
  ) {
    const result = await this.tx.send(actor.keyIndex, 'TradeLedger', build);
    await this.applier.apply(result);
    return result;
  }

  // --- Views ---

  produceRef(code: string): ProduceRefDto {
    const produce = this.catalog.produceTypes.get(code);
    const unit = produce ? this.catalog.units.get(produce.unitCode) : undefined;
    return {
      code,
      name: produce?.name ?? code,
      nameBn: produce?.nameBn ?? code,
      unit: unit?.symbol ?? '',
      unitBn: unit?.symbolBn ?? '',
    };
  }

  /** One query each for projects, details and names, whatever the page size. */
  private async listingDtos(
    actor: AuthUser,
    rows: Listing[],
  ): Promise<ListingDto[]> {
    if (rows.length === 0) return [];
    const projectIds = [
      ...new Set(rows.flatMap((l) => (l.projectId ? [l.projectId] : []))),
    ];
    const detailIds = rows.flatMap((l) => (l.detailsId ? [l.detailsId] : []));
    const [projects, details] = await Promise.all([
      projectIds.length
        ? this.projects.find({
            where: { id: In(projectIds) },
            select: { id: true, title: true, districtCode: true },
          })
        : [],
      detailIds.length ? this.details.findBy({ id: In(detailIds) }) : [],
    ]);
    const byId = new Map(projects.map((p) => [p.id, p]));
    const detailsOf = new Map(details.map((d) => [d.id, d]));
    const [sellers, officerOf] = await Promise.all([
      this.sellerRefs(actor, rows),
      this.farmersOfficer(actor, rows),
    ]);
    // The project names its farmer: only WeGro's side and that farmer see it.
    const seesProject = (l: Listing): boolean =>
      STAFF.has(actor.role) ||
      l.farmerId === actor.id ||
      (!!l.farmerId && officerOf.has(l.farmerId));
    return rows.map((l) => {
      const p = l.projectId ? byId.get(l.projectId) : undefined;
      const d = l.detailsId ? detailsOf.get(l.detailsId) : undefined;
      const district = p?.districtCode ?? d?.districtCode ?? '';
      return {
        id: l.id,
        project:
          l.projectId && seesProject(l)
            ? { id: l.projectId, name: p?.title ?? '' }
            : null,
        district: {
          code: district,
          name: isDistrictCode(district)
            ? BD_DISTRICTS[district].name
            : district,
        },
        produce: this.produceRef(l.produceCode),
        source: !l.projectId
          ? ('seller' as const)
          : l.receiptId
            ? ('warehouse' as const)
            : ('fresh' as const),
        receiptId: l.receiptId,
        seller: sellers(l),
        quantity: l.quantity,
        available: l.available,
        askingUnitPrice: poishaToTaka(l.askingUnitPrice),
        unpaidDeals: l.unpaidDeals,
        status: l.status!,
        createdAt: l.createdAt,
        closedAt: l.closedAt,
        description: d?.description ?? null,
        photos: (d?.photos ?? []).map(
          (_, i) => `/api/listings/${l.id}/photos/${i}`,
        ),
        rejectReason: l.rejectReason,
        decidedAt: l.decidedAt,
      };
    });
  }

  /** The farmers among these listings who are this field officer's own. */
  private async farmersOfficer(
    actor: AuthUser,
    rows: Pick<Listing, 'farmerId' | 'sellerId'>[],
  ): Promise<Set<string>> {
    if (actor.role !== Role.FIELD_OFFICER) return new Set();
    const ids = [
      ...new Set(
        rows.flatMap((l) => [l.farmerId, l.sellerId]).filter((id) => !!id),
      ),
    ] as string[];
    const mine = await this.users.find({
      where: { id: In(ids), fieldOfficerId: actor.id },
      select: { id: true },
    });
    return new Set(mine.map((u) => u.id));
  }

  /**
   * Who sells each listing: WeGro, the farmer, or the external seller (names
   * in one query). Only WeGro's staff, the seller and a farmer's own officer
   * learn who it is; to anyone else the seller has no id or name at all, so
   * buyers cannot go around the platform to reach them.
   */
  private async sellerRefs(
    actor: AuthUser,
    rows: Pick<
      Listing,
      'projectId' | 'sellerIsWegro' | 'sellerId' | 'farmerId'
    >[],
  ): Promise<
    (l: Pick<Listing, 'projectId' | 'sellerIsWegro' | 'sellerId'>) => SellerDto
  > {
    const own = await this.farmersOfficer(actor, rows);
    const knows = (id: string | null): id is string =>
      !!id && (STAFF.has(actor.role) || id === actor.id || own.has(id));
    const names = await this.views.names(
      rows.flatMap((l) => (knows(l.sellerId) ? [l.sellerId] : [])),
    );
    return (l) => {
      if (l.sellerIsWegro) return { kind: 'wegro', id: null, name: 'WeGro' };
      const kind = l.projectId ? 'farmer' : 'seller';
      return knows(l.sellerId)
        ? { kind, id: l.sellerId, name: names.get(l.sellerId) ?? '' }
        : { kind, id: null, name: null };
    };
  }

  /** One query each for listings, deliveries and names, whatever the page size. */
  private async offerDtos(actor: AuthUser, rows: Offer[]): Promise<OfferDto[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((o) => o.id);
    const [listings, deliveries, now] = await Promise.all([
      this.listings.find({
        where: { id: In([...new Set(rows.map((o) => o.listingId))]) },
        select: {
          id: true,
          produceCode: true,
          projectId: true,
          sellerIsWegro: true,
          sellerId: true,
          farmerId: true,
        },
      }),
      this.deliveries.findBy({ offerId: In(ids) }),
      this.clock.now(),
    ]);
    const listingOf = new Map(listings.map((l) => [l.id, l]));
    // Those who may know the buyer: never the seller's side of the sale. Each
    // deal on its own, for someone who is the buyer on one and the seller on another.
    const seesBuyer = (o: Offer): boolean =>
      SEES_BUYERS.has(actor.role) || o.buyerId === actor.id;
    const [names, sellerOf] = await Promise.all([
      this.views.names(rows.filter(seesBuyer).map((o) => o.buyerId)),
      this.sellerRefs(actor, listings),
    ]);
    const bySide = new Map(
      deliveries.map((d) => [`${d.offerId}:${d.side}`, d]),
    );
    const seesPayments = SEES_PAYMENTS.has(actor.role);
    // What was sent is between the buyer and those who check payments.
    const seesMoney = (o: Offer): boolean =>
      seesPayments || o.buyerId === actor.id;
    const moneyIds = rows.filter(seesMoney).map((o) => o.id);
    const money = moneyIds.length
      ? await this.payments(moneyIds)
      : new Map<number, typeof NONE>();
    const view = (o: Offer, side: DeliverySide): DeliveryViewDto | null => {
      const d = bySide.get(`${o.id}:${side}`);
      return d
        ? {
            quantity: d.quantity,
            notes: d.notes,
            photoUrl: d.photoId
              ? `/api/offers/${o.id}/deliveries/${side}/photo`
              : null,
            status: d.status,
            recordedAt: d.recordedAt,
          }
        : null;
    };
    return rows.map((o) => {
      const buyerDelivery = view(o, DeliverySide.BUYER);
      const handlerDelivery = view(o, DeliverySide.HANDLER);
      const listing = listingOf.get(o.listingId);
      const external = !!listing && listing.projectId === null;
      const amount = o.unitPrice * BigInt(o.quantity);
      const { paid, underReview } = money.get(o.id) ?? NONE;
      const onHold = o.pausedRemaining !== null;
      return {
        id: o.id,
        listingId: o.listingId,
        produce: this.produceRef(listing?.produceCode ?? ''),
        buyer: seesBuyer(o)
          ? { id: o.buyerId, name: names.get(o.buyerId) ?? '' }
          : { id: null, name: null },
        quantity: o.quantity,
        unitPrice: poishaToTaka(o.unitPrice),
        amount: poishaToTaka(o.unitPrice * BigInt(o.quantity)),
        status: o.status!,
        madeAt: o.madeAt,
        paymentDueAt: o.paymentDueAt,
        overdue:
          o.status === OfferStatus.APPROVED &&
          !onHold &&
          !!o.paymentDueAt &&
          o.paymentDueAt <= now,
        onHold,
        pausedRemainingSeconds: o.pausedRemaining,
        ...(seesMoney(o) && {
          paid: poishaToTaka(paid),
          underReview: poishaToTaka(underReview),
          remaining:
            o.buyerFee == null
              ? null
              : poishaToTaka(leftToPay(amount + o.buyerFee, paid, underReview)),
        }),
        paidAt: o.paidAt,
        receiptPartId: o.receiptPartId,
        buyerDelivery,
        handlerDelivery,
        discrepancy: [buyerDelivery, handlerDelivery].some(
          (d) => d && d.quantity !== o.quantity,
        ),
        deliveredAt: o.deliveredAt,
        seller: listing
          ? sellerOf(listing)
          : { kind: 'wegro' as const, id: null, name: 'WeGro' },
        external,
        buyerFee: o.buyerFee == null ? null : poishaToTaka(o.buyerFee),
        sellerFee: o.sellerFee == null ? null : poishaToTaka(o.sellerFee),
        buyerPays:
          o.buyerFee == null ? null : poishaToTaka(amount + o.buyerFee),
        sellerReceives:
          external && o.sellerFee != null
            ? poishaToTaka(amount - o.sellerFee)
            : null,
        sellerPaidAt: o.sellerPaidAt ?? null,
        ...(seesPayments && {
          paymentReference: o.paymentRefEnc
            ? this.crypto.decrypt(o.paymentRefEnc, offerContext(o.id))
            : null,
          sellerPayoutReference: o.sellerPayoutRefEnc
            ? this.crypto.decrypt(o.sellerPayoutRefEnc, payoutContext(o.id))
            : null,
        }),
      };
    });
  }
}

const NONE = { paid: 0n, underReview: 0n };

/** Free text the other side of a sale reads must not say how to reach its writer. */
function refuseContactDetails(text: string): void {
  if (hasContactDetails(text)) {
    throw new UnprocessableEntityException({
      message:
        'Remove phone numbers, email addresses and links: WeGro arranges every handover',
      code: ErrorCode.CONTACT_DETAILS_NOT_ALLOWED,
    });
  }
}

/** What the buyer still has to send; never below nothing. */
function leftToPay(total: bigint, paid: bigint, underReview: bigint): bigint {
  const left = total - paid - underReview;
  return left > 0n ? left : 0n;
}

const offerContext = (id: number) => `offers.payment_ref:${id}`;
const payoutContext = (id: number) => `offers.seller_payout_ref:${id}`;

/** The ledger's detailsHash of an external listing: everything the seller wrote, bound to its id. */
export function listingFingerprint(
  d: Pick<
    ListingDetails,
    | 'id'
    | 'sellerId'
    | 'produceCode'
    | 'quantity'
    | 'askingUnitPrice'
    | 'districtCode'
    | 'description'
    | 'photos'
  >,
): string {
  return fingerprint('trade.external_listing', {
    v: 1,
    detailsId: d.id,
    sellerId: d.sellerId,
    produceCode: d.produceCode,
    quantity: d.quantity,
    askingUnitPrice: d.askingUnitPrice.toString(),
    districtCode: d.districtCode,
    description: d.description,
    photoHashes: d.photos.map((p) => p.hash),
  });
}

/** The ledger's qualityHash: what this side confirmed, bound to the deal and side. */
export function deliveryFingerprint(
  d: Pick<Delivery, 'offerId' | 'side' | 'quantity' | 'notes' | 'photoHash'>,
): string {
  return fingerprint('trade.delivery', {
    v: 1,
    offerId: d.offerId,
    side: d.side,
    quantity: d.quantity,
    notes: d.notes,
    photoHash: d.photoHash,
  });
}
