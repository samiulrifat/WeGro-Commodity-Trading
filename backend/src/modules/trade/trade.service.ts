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
import {
  In,
  IsNull,
  Not,
  QueryFailedError,
  Repository,
  type SelectQueryBuilder,
} from 'typeorm';
import { ChainClock } from '../../blockchain/chain-clock';
import { ContractRevertException } from '../../blockchain/errors/contract-errors';
import type { TradeLedger } from '../../blockchain/generated';
import { ReceiptApplier } from '../../blockchain/indexer/receipt-applier';
import { TransactionService } from '../../blockchain/tx/transaction.service';
import { fingerprint } from '../../blockchain/utils/fingerprint';
import { uuidToBytes32 } from '../../blockchain/utils/ids';
import { poishaToTaka, takaToPoisha } from '../../blockchain/utils/money';
import {
  hashPaymentRef,
  normalisePaymentRef,
} from '../../blockchain/utils/payment-ref';
import { IdentityCryptoService } from '../../common/crypto/identity-crypto.service';
import { Paginated } from '../../common/dto/pagination.dto';
import {
  BD_DISTRICTS,
  isDistrictCode,
} from '../../common/reference/bd-districts';
import { isPastDay } from '../../common/time/bd-dates';
import type { EnvironmentVariables } from '../../config/env.validation';
import type { AuthUser } from '../auth/auth-user';
import { CatalogService } from '../catalog/catalog.service';
import { ProduceCategory } from '../catalog/catalog.enums';
import type { Photo } from '../field-records/entities/photo.entity';
import { photoHash, PhotosService } from '../field-records/photos.service';
import { Project } from '../projects/entities/project.entity';
import { ProjectStage } from '../projects/project.enums';
import { ProjectViews } from '../projects/project-views';
import { User } from '../users/entities/user.entity';
import { actsAs, Role } from '../users/roles';
import { WarehouseOperator } from '../warehouse/entities/warehouse-operator.entity';
import { WarehouseReceipt } from '../warehouse/entities/warehouse-receipt.entity';
import { ReceiptStatus } from '../warehouse/warehouse.enums';
import type {
  ConfirmDeliveryDto,
  DeliveryViewDto,
  ListingDto,
  ListListingsQueryDto,
  ListOffersQueryDto,
  ListProduceDto,
  ListReceiptDto,
  MakeOfferDto,
  OfferDto,
  ProduceRefDto,
} from './dto/trade.dto';
import { Delivery } from './entities/delivery.entity';
import { Listing } from './entities/listing.entity';
import { Offer } from './entities/offer.entity';
import { DeliverySide, ListingStatus, OfferStatus } from './trade.enums';
import { ErrorCode } from '../../common/errors/error-code';

const STAFF: ReadonlySet<Role> = new Set([
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.OPERATIONS,
  Role.ACCOUNTS,
  Role.AUDITOR,
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
    private readonly clock: ChainClock,
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
    await this.requireActive(receipt.projectId);
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
    );
  }

  /** Stops selling what is left; unpaid deals must be cancelled or expire first. */
  async cancelListing(actor: AuthUser, id: number): Promise<ListingDto> {
    const listing = await this.openListing(id);
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
    return this.listingOne(id);
  }

  async listListings(q: ListListingsQueryDto): Promise<Paginated<ListingDto>> {
    const qb = this.listings
      .createQueryBuilder('l')
      .where('l.status = :st', { st: q.status ?? ListingStatus.OPEN });
    if (q.produceCode)
      qb.andWhere('l.produce_code = :pc', { pc: q.produceCode });
    if (q.projectId) qb.andWhere('l.project_id = :pid', { pid: q.projectId });
    if (q.districtCode) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM projects p WHERE p.id = l.project_id AND p.district_code = :dc)',
        {
          dc: q.districtCode,
        },
      );
    }
    const [rows, total] = await qb
      .orderBy('l.created_at', 'DESC')
      .addOrderBy('l.id', 'DESC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    return new Paginated(await this.listingDtos(rows), total, q);
  }

  async listingOne(id: number): Promise<ListingDto> {
    const listing = await this.listings.findOneBy({ id });
    if (!listing || listing.status === null)
      throw new NotFoundException({
        message: 'Listing not found',
        code: ErrorCode.LISTING_NOT_FOUND,
      });
    return (await this.listingDtos([listing]))[0];
  }

  // --- Offers and deals ---

  async makeOffer(
    actor: AuthUser,
    listingId: number,
    dto: MakeOfferDto,
  ): Promise<OfferDto> {
    const listing = await this.openListing(listingId);
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
    await this.offerIn(id, [OfferStatus.PENDING]);
    await this.send(actor, (c) => c.rejectOffer.populateTransaction(id));
    return this.offerOne(actor, id);
  }

  /** The offer becomes a deal: its quantity is reserved until paid or past its deadline. */
  async approveOffer(actor: AuthUser, id: number): Promise<OfferDto> {
    const offer = await this.offerIn(id, [OfferStatus.PENDING]);
    const listing = await this.openListing(offer.listingId);
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
   * Accounts confirms the buyer paid, before the deadline. The reference is
   * saved encrypted first (only one confirmation in flight per deal); the
   * ledger gets its keyed hash and refuses to accept it twice. For a
   * receipt, the bought quantity splits off to the buyer.
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
    const hash = hashPaymentRef(ref, this.paymentRefSecret);
    const offer = await this.offerIn(id, [OfferStatus.APPROVED]);
    if (offer.paymentDueAt && offer.paymentDueAt <= (await this.clock.now())) {
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

  /**
   * The buyer, or the handler (an operator of the receipt's warehouse site;
   * the farmer's field officer for fresh produce), confirms quantity and
   * condition. Both recorded: delivered. Mismatching quantities are recorded
   * as given and flagged; the ledger counts the deal at its agreed quantity.
   */
  async confirmDelivery(
    actor: AuthUser,
    id: number,
    dto: ConfirmDeliveryDto,
  ): Promise<OfferDto> {
    const offer = await this.offerIn(id, [OfferStatus.PAID]);
    const listing = await this.listings.findOneByOrFail({
      id: offer.listingId,
    });
    const side =
      actor.role === Role.BUYER && offer.buyerId === actor.id
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
    await this.scopeOffers(actor, qb);
    if (q.listingId) qb.andWhere('o.listing_id = :lid', { lid: q.listingId });
    if (q.status) qb.andWhere('o.status = :st', { st: q.status });
    if (q.discrepancy) {
      // Both sides agree with the deal exactly when neither differs from it.
      qb.andWhere(
        'EXISTS (SELECT 1 FROM deliveries d WHERE d.offer_id = o.id AND d.quantity <> o.quantity)',
      );
    }
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
    const listing = await this.listings.findOneBy({ id });
    if (!listing || listing.status === null)
      throw new NotFoundException({
        message: 'Listing not found',
        code: ErrorCode.LISTING_NOT_FOUND,
      });
    if (listing.status !== ListingStatus.OPEN) {
      throw new ConflictException({
        message: `This listing is ${listing.status}`,
        code: ErrorCode.LISTING_WRONG_STATUS,
        details: { status: listing.status },
      });
    }
    return listing;
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
    return l.sellerIsWegro
      ? actsAs(actor.role, Role.ADMIN)
      : this.isOfficerOf(actor, l.farmerId);
  }

  /** Receipt: an operator of the issuing site. Fresh produce: the farmer's officer. */
  private async isHandler(actor: AuthUser, l: Listing): Promise<boolean> {
    if (!l.receiptId) return this.isOfficerOf(actor, l.farmerId);
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
   * offers on listings they sell or hand over.
   */
  private async scopeOffers(
    actor: AuthUser,
    qb: SelectQueryBuilder<Offer>,
  ): Promise<void> {
    if (STAFF.has(actor.role)) return;
    switch (actor.role) {
      case Role.BUYER:
        qb.andWhere('o.buyer_id = :me', { me: actor.id });
        return;
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
    };
  }

  private async listingDtos(rows: Listing[]): Promise<ListingDto[]> {
    if (rows.length === 0) return [];
    const projects = await this.projects.find({
      where: { id: In([...new Set(rows.map((l) => l.projectId))]) },
      select: { id: true, title: true, districtCode: true },
    });
    const byId = new Map(projects.map((p) => [p.id, p]));
    const names = await this.views.names(
      rows.flatMap((l) => (l.sellerId ? [l.sellerId] : [])),
    );
    return rows.map((l) => {
      const p = byId.get(l.projectId);
      const district = p?.districtCode ?? '';
      return {
        id: l.id,
        project: { id: l.projectId, name: p?.title ?? '' },
        district: {
          code: district,
          name: isDistrictCode(district)
            ? BD_DISTRICTS[district].name
            : district,
        },
        produce: this.produceRef(l.produceCode),
        source: l.receiptId ? ('warehouse' as const) : ('fresh' as const),
        receiptId: l.receiptId,
        seller: l.sellerIsWegro
          ? { kind: 'wegro' as const, id: null, name: 'WeGro' }
          : {
              kind: 'farmer' as const,
              id: l.sellerId,
              name: names.get(l.sellerId!) ?? '',
            },
        quantity: l.quantity,
        available: l.available,
        askingUnitPrice: poishaToTaka(l.askingUnitPrice),
        unpaidDeals: l.unpaidDeals,
        status: l.status!,
        createdAt: l.createdAt,
        closedAt: l.closedAt,
      };
    });
  }

  /** One query each for listings, deliveries and names, whatever the page size. */
  private async offerDtos(actor: AuthUser, rows: Offer[]): Promise<OfferDto[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((o) => o.id);
    const [listings, deliveries, now] = await Promise.all([
      this.listings.find({
        where: { id: In([...new Set(rows.map((o) => o.listingId))]) },
        select: { id: true, produceCode: true },
      }),
      this.deliveries.findBy({ offerId: In(ids) }),
      this.clock.now(),
    ]);
    const produceOf = new Map(listings.map((l) => [l.id, l.produceCode]));
    const names = await this.views.names(rows.map((o) => o.buyerId));
    const bySide = new Map(
      deliveries.map((d) => [`${d.offerId}:${d.side}`, d]),
    );
    const seesPayments = SEES_PAYMENTS.has(actor.role);
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
      return {
        id: o.id,
        listingId: o.listingId,
        produce: this.produceRef(produceOf.get(o.listingId) ?? ''),
        buyer: { id: o.buyerId, name: names.get(o.buyerId) ?? '' },
        quantity: o.quantity,
        unitPrice: poishaToTaka(o.unitPrice),
        amount: poishaToTaka(o.unitPrice * BigInt(o.quantity)),
        status: o.status!,
        madeAt: o.madeAt,
        paymentDueAt: o.paymentDueAt,
        overdue:
          o.status === OfferStatus.APPROVED &&
          !!o.paymentDueAt &&
          o.paymentDueAt <= now,
        paidAt: o.paidAt,
        receiptPartId: o.receiptPartId,
        buyerDelivery,
        handlerDelivery,
        discrepancy: [buyerDelivery, handlerDelivery].some(
          (d) => d && d.quantity !== o.quantity,
        ),
        deliveredAt: o.deliveredAt,
        ...(seesPayments && {
          paymentReference: o.paymentRefEnc
            ? this.crypto.decrypt(o.paymentRefEnc, offerContext(o.id))
            : null,
        }),
      };
    });
  }
}

const offerContext = (id: number) => `offers.payment_ref:${id}`;

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
