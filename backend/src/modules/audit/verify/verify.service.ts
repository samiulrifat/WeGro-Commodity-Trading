import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, type EntityTarget, type ObjectLiteral } from 'typeorm';
import { ContractsRegistry } from '../../../blockchain/contracts.registry';
import {
  codeToBytes32,
  uuidToBytes32,
  ZERO_BYTES32,
} from '../../../blockchain/utils/ids';
import { Photo } from '../../field-records/entities/photo.entity';
import { FieldRecordsService } from '../../field-records/field-records.service';
import { photoHash, PhotosService } from '../../field-records/photos.service';
import { CoverageTerms } from '../../insurance/entities/coverage-terms.entity';
import { InsuranceClaim } from '../../insurance/entities/insurance-claim.entity';
import { WeatherEvent } from '../../insurance/entities/weather-event.entity';
import {
  assessmentFingerprint,
  claimFingerprint,
  coverageFingerprint,
  weatherEventFingerprint,
} from '../../insurance/insurance-fingerprints';
import {
  CLAIM_STATUS_BY_CHAIN,
  ClaimStatus,
} from '../../insurance/insurance.enums';
import { ParticipantsService } from '../../participants/participants.service';
import { Reservation } from '../../projects/entities/reservation.entity';
import { RESERVATION_STATUS_BY_CHAIN } from '../../projects/project.enums';
import { ProjectsService } from '../../projects/projects.service';
import { PayoutLine } from '../../settlement/entities/payout-line.entity';
import { ProjectCost } from '../../settlement/entities/project-cost.entity';
import { SettlementRound } from '../../settlement/entities/settlement-round.entity';
import { costFingerprint, lineHash } from '../../settlement/settlement-math';
import { CostStatus } from '../../settlement/settlement.enums';
import { Bank } from '../../track-record/entities/bank.entity';
import { BankConsent } from '../../track-record/entities/bank-consent.entity';
import { TrackRecord } from '../../track-record/entities/track-record.entity';
import {
  bankFingerprint,
  consentFingerprint,
} from '../../track-record/track-record-fingerprints';
import { summaryFingerprint } from '../../track-record/track-record-summary';
import { ConsentStatus } from '../../track-record/track-record.enums';
import { BuyerRequest } from '../../trade/entities/buyer-request.entity';
import { Delivery } from '../../trade/entities/delivery.entity';
import { Listing } from '../../trade/entities/listing.entity';
import { Offer } from '../../trade/entities/offer.entity';
import { deliveryFingerprint } from '../../trade/trade.service';
import { DeliverySide, RequestStatus } from '../../trade/trade.enums';
import { batchFingerprint } from '../../vouchers/batches.service';
import { InputBatch } from '../../vouchers/entities/input-batch.entity';
import { VoucherSaleBatch } from '../../vouchers/entities/voucher-sale-batch.entity';
import { VoucherSale } from '../../vouchers/entities/voucher-sale.entity';
import { Voucher } from '../../vouchers/entities/voucher.entity';
import { WarehouseReceipt } from '../../warehouse/entities/warehouse-receipt.entity';
import { WarehouseSite } from '../../warehouse/entities/warehouse-site.entity';
import {
  intakeFingerprint,
  siteFingerprint,
} from '../../warehouse/warehouse.service';
import { WEGRO_OWNER } from '../../warehouse/warehouse.enums';
import { ErrorCode } from '../../../common/errors/error-code';

/** A record checked against the ledger. */
export interface Verification {
  onLedger: boolean;
  /** What differs; empty when the database and the ledger agree. */
  mismatches: string[];
}

/** Chain enum index -> database status name, for the ledgers' status enums. */
const VOUCHER_STATUS = ['none', 'proposed', 'active', 'rejected', 'cancelled'];
const SALE_STATUS = ['none', 'pending', 'confirmed', 'cancelled', 'expired'];
const LISTING_STATUS = ['none', 'open', 'cancelled', 'sold_out'];
const OFFER_STATUS = [
  'none',
  'pending',
  'withdrawn',
  'rejected',
  'approved',
  'cancelled',
  'paid',
  'delivered',
  'expired',
];
const RECEIPT_STATUS = [
  'none',
  'issued',
  'pending_handover',
  'listed',
  'sold',
  'collected',
  'sold_out',
];
const ROUND_STATUS = ['none', 'prepared', 'approved', 'rejected', 'paid'];

export const VERIFY_TYPES = [
  'participant',
  'project',
  'reservation',
  'voucher',
  'voucher-sale',
  'batch',
  'field-record',
  'warehouse-site',
  'receipt',
  'listing',
  'offer',
  'buyer-request',
  'coverage',
  'weather-event',
  'claim',
  'cost',
  'round',
  'bank',
  'track-record',
  'consent',
] as const;
export type VerifyType = (typeof VERIFY_TYPES)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMBER = /^\d{1,15}$/;
const BYTES32 = /^0x[0-9a-f]{64}$/i;

/**
 * Checks one record against the ledger: its fingerprint is recomputed from
 * the database (photos from the files on disk) and compared with what the
 * ledger holds, along with the figures and status the ledger keeps. Each
 * check is a handful of reads, so a sweep over everything is linear.
 */
@Injectable()
export class VerifyService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly contracts: ContractsRegistry,
    private readonly photos: PhotosService,
    private readonly participants: ParticipantsService,
    private readonly projects: ProjectsService,
    private readonly fieldRecords: FieldRecordsService,
  ) {}

  /** 404 when the id cannot be such a record or no such record exists. */
  async verify(type: VerifyType, id: string): Promise<Verification> {
    switch (type) {
      case 'participant': {
        const r = await this.participants.integrity(uuid(id));
        return result(r.mismatches);
      }
      case 'project': {
        const r = await this.projects.integrity(uuid(id));
        return result(r.mismatches);
      }
      case 'field-record': {
        const r = await this.fieldRecords.verify(uuid(id));
        return result(r.mismatches);
      }
      case 'reservation':
        return this.reservation(num(id));
      case 'voucher':
        return this.voucher(uuid(id));
      case 'voucher-sale':
        return this.sale(num(id));
      case 'batch':
        return this.batch(uuid(id));
      case 'warehouse-site':
        return this.site(uuid(id));
      case 'receipt':
        return this.receipt(bytes32(id));
      case 'listing':
        return this.listing(num(id));
      case 'offer':
        return this.offer(num(id));
      case 'buyer-request':
        return this.request(num(id));
      case 'coverage':
        return this.coverage(uuid(id));
      case 'weather-event':
        return this.weatherEvent(uuid(id));
      case 'claim':
        return this.claim(uuid(id));
      case 'cost':
        return this.cost(uuid(id));
      case 'round':
        return this.round(num(id));
      case 'bank':
        return this.bank(uuid(id));
      case 'track-record':
        return this.trackRecord(uuid(id));
      case 'consent':
        return this.consent(uuid(id));
    }
  }

  // --- Projects ---

  private async reservation(id: number): Promise<Verification> {
    const r = await this.row(Reservation, { id });
    const c = await this.c('ProjectLedger').getReservation(id);
    if (Number(c.status) === 0) return missing();
    const m = new Mismatches();
    m.check('status', r.status, RESERVATION_STATUS_BY_CHAIN[Number(c.status)]);
    m.check('projectId', uuidToBytes32(r.projectId), c.projectId);
    m.check('investorId', uuidToBytes32(r.investorId), c.investorId);
    m.check('slots', r.slots, Number(c.slots));
    m.check('paymentRef', r.paymentRefHash ?? ZERO_BYTES32, c.paymentRefHash, {
      onlyIf: r.status === 'confirmed',
    });
    return m.done();
  }

  // --- Vouchers ---

  private async voucher(id: string): Promise<Verification> {
    const v = await this.row(Voucher, { id });
    const c = await this.c('VoucherRegistry').getVoucher(uuidToBytes32(id));
    if (Number(c.status) === 0) return missing();
    const m = new Mismatches();
    m.check('status', v.status, VOUCHER_STATUS[Number(c.status)]);
    m.check('projectId', uuidToBytes32(v.projectId), c.projectId);
    m.check('farmerId', uuidToBytes32(v.farmerId), c.farmerId);
    m.check('inputType', codeToBytes32(v.inputTypeCode), c.inputType);
    m.check('quantity', BigInt(v.quantity), c.quantity);
    m.check('unitPrice', v.unitPrice, c.unitPrice);
    m.check('value', v.value, c.value);
    m.check('spentQuantity', BigInt(v.spentQuantity), c.spentQuantity);
    m.check('heldQuantity', BigInt(v.heldQuantity), c.heldQuantity);
    return m.done();
  }

  private async sale(id: number): Promise<Verification> {
    const s = await this.row(VoucherSale, { id });
    const registry = this.c('VoucherRegistry');
    const [c, batches, rows] = await Promise.all([
      registry.getSale(id),
      registry.getSaleBatches(id),
      this.dataSource
        .getRepository(VoucherSaleBatch)
        .find({ where: { saleId: String(id) }, order: { position: 'ASC' } }),
    ]);
    if (Number(c.status) === 0) return missing();
    const m = new Mismatches();
    m.check('status', s.status, SALE_STATUS[Number(c.status)]);
    m.check('voucherId', uuidToBytes32(s.voucherId), c.voucherId);
    m.check('supplierId', uuidToBytes32(s.supplierId), c.supplierId);
    m.check('quantity', BigInt(s.quantity), c.quantity);
    m.check('amount', s.amount, c.amount);
    m.check(
      'batches',
      rows.map((b) => uuidToBytes32(b.batchId)).join(),
      [...batches].join(),
    );
    return m.done();
  }

  private async batch(id: string): Promise<Verification> {
    const b = await this.row(InputBatch, { id });
    const c = await this.c('VoucherRegistry').getBatch(uuidToBytes32(id));
    if (c.registeredAt === 0n) return missing();
    const m = new Mismatches();
    m.fingerprint(batchFingerprint(b), b.detailsHash, c.detailsHash);
    m.check('supplierId', uuidToBytes32(b.supplierId), c.supplierId);
    m.check('productCode', codeToBytes32(b.inputTypeCode), c.productCode);
    return m.done();
  }

  // --- Warehouse ---

  private async site(id: string): Promise<Verification> {
    const s = await this.row(WarehouseSite, { id });
    const ledger = await this.c('WarehouseReceipt').siteDetails(
      uuidToBytes32(id),
    );
    if (ledger === ZERO_BYTES32) return missing();
    const m = new Mismatches();
    m.fingerprint(siteFingerprint(s), s.detailsHash, ledger);
    return m.done();
  }

  private async receipt(id: string): Promise<Verification> {
    const r = await this.row(WarehouseReceipt, { id });
    const c = await this.c('WarehouseReceipt').getReceipt(id);
    if (Number(c.status) === 0) return missing();
    const m = new Mismatches();
    // A part split off for a buyer carries its original receipt's intake record.
    let intake = r;
    while (intake.parentId) {
      intake = await this.row(WarehouseReceipt, { id: intake.parentId });
    }
    m.fingerprint(intakeFingerprint(intake), r.detailsHash, c.detailsHash);
    m.check('status', r.status, RECEIPT_STATUS[Number(c.status)]);
    m.check('quantity', BigInt(r.quantity), c.quantity);
    m.check(
      'owner',
      r.ownerIsWegro ? WEGRO_OWNER : uuidToBytes32(r.ownerId!),
      c.owner,
    );
    m.check('projectId', uuidToBytes32(r.projectId), c.projectId);
    m.check('siteId', uuidToBytes32(r.siteId), c.siteId);
    m.check('parentId', r.parentId ?? ZERO_BYTES32, c.parentId);
    return m.done();
  }

  // --- Marketplace ---

  private async listing(id: number): Promise<Verification> {
    const l = await this.row(Listing, { id });
    const c = await this.c('TradeLedger').getListing(id);
    if (Number(c.status) === 0) return missing();
    const m = new Mismatches();
    m.check('status', l.status, LISTING_STATUS[Number(c.status)]);
    m.check('projectId', uuidToBytes32(l.projectId), c.projectId);
    m.check('receiptId', l.receiptId ?? ZERO_BYTES32, c.receiptId);
    m.check('quantity', BigInt(l.quantity), c.quantity);
    m.check('available', BigInt(l.available), c.available);
    m.check('askingUnitPrice', l.askingUnitPrice, c.askingUnitPrice);
    m.check('unpaidDeals', l.unpaidDeals, Number(c.unpaidDeals));
    return m.done();
  }

  private async offer(id: number): Promise<Verification> {
    const o = await this.row(Offer, { id });
    const trade = this.c('TradeLedger');
    const [c, d, deliveries] = await Promise.all([
      trade.getOffer(id),
      trade.getDelivery(id),
      this.dataSource
        .getRepository(Delivery)
        .findBy({ offerId: id, status: 'recorded' }),
    ]);
    if (Number(c.status) === 0) return missing();
    const m = new Mismatches();
    m.check('status', o.status, OFFER_STATUS[Number(c.status)]);
    m.check('listingId', BigInt(o.listingId), c.listingId);
    m.check('buyerId', uuidToBytes32(o.buyerId), c.buyerId);
    m.check('quantity', BigInt(o.quantity), c.quantity);
    m.check('unitPrice', o.unitPrice, c.unitPrice);
    m.check('paymentRef', o.paymentRefHash ?? ZERO_BYTES32, c.paymentRefHash);
    m.check('receiptPartId', o.receiptPartId ?? ZERO_BYTES32, c.receiptPartId);
    for (const side of [DeliverySide.Buyer, DeliverySide.Handler]) {
      const row = deliveries.find((x) => x.side === side);
      const [ledgerQty, ledgerHash] =
        side === DeliverySide.Buyer
          ? [d.buyerQuantity, d.buyerQualityHash]
          : [d.handlerQuantity, d.handlerQualityHash];
      if (!row) {
        m.check(`${side}Delivery`, ZERO_BYTES32, ledgerHash);
        continue;
      }
      m.fingerprint(
        deliveryFingerprint(row),
        row.qualityHash,
        ledgerHash,
        `${side}Delivery`,
      );
      m.check(`${side}Quantity`, BigInt(row.quantity), ledgerQty);
      if (row.photoId) {
        m.check(
          `${side}Photo`,
          row.photoHash,
          await this.diskPhotoHash(row.photoId),
        );
      }
    }
    return m.done();
  }

  private async request(id: number): Promise<Verification> {
    const r = await this.row(BuyerRequest, { id });
    const c = await this.c('TradeLedger').getRequest(id);
    if (c.buyerId === ZERO_BYTES32) return missing();
    const m = new Mismatches();
    m.check('buyerId', uuidToBytes32(r.buyerId), c.buyerId);
    m.check('produceCode', codeToBytes32(r.produceCode), c.produceCode);
    m.check('quantity', BigInt(r.quantity), c.quantity);
    m.check('maxUnitPrice', r.maxUnitPrice, c.maxUnitPrice);
    m.check('validUntil', BigInt(r.validUntil.getTime() / 1000), c.validUntil);
    m.check('cancelled', r.status === RequestStatus.Cancelled, c.cancelled);
    return m.done();
  }

  // --- Insurance ---

  /** A project's current cover (id = project id). */
  private async coverage(projectId: string): Promise<Verification> {
    const t = await this.dataSource.getRepository(CoverageTerms).findOne({
      where: { projectId, status: 'recorded' },
      order: { chainEventBlock: 'DESC', chainEventLog: 'DESC' },
    });
    if (!t)
      throw new NotFoundException({
        message: 'No cover for this project',
        code: ErrorCode.NoCoverage,
      });
    const c = await this.c('InsuranceRegistry').getCoverage(
      uuidToBytes32(projectId),
    );
    if (c.termsHash === ZERO_BYTES32) return missing();
    const m = new Mismatches();
    m.fingerprint(coverageFingerprint(t), t.termsHash, c.termsHash);
    m.check('maxAmount', t.maxAmount, c.maxAmount);
    m.check('insurerId', uuidToBytes32(t.insurerId), c.insurerId);
    return m.done();
  }

  private async weatherEvent(id: string): Promise<Verification> {
    const e = await this.row(WeatherEvent, { id });
    const c = await this.c('InsuranceRegistry').getWeatherEvent(
      uuidToBytes32(id),
    );
    if (c.recordedAt === 0n) return missing();
    const m = new Mismatches();
    m.fingerprint(weatherEventFingerprint(e), e.detailsHash, c.detailsHash);
    m.check('regionCode', codeToBytes32(e.districtCode), c.regionCode);
    m.check('eventType', codeToBytes32(e.eventTypeCode), c.eventType);
    return m.done();
  }

  private async claim(id: string): Promise<Verification> {
    const k = await this.row(InsuranceClaim, { id });
    const c = await this.c('InsuranceRegistry').getClaim(uuidToBytes32(id));
    if (Number(c.status) === 0) return missing();
    const m = new Mismatches();
    const photoHashes = await Promise.all(
      k.photoIds.map((p) => this.diskPhotoHash(p)),
    );
    if (photoHashes.includes(null)) m.add('photoMissing');
    m.fingerprint(
      claimFingerprint({
        claimId: k.id,
        projectId: k.projectId,
        eventId: k.eventId,
        damagePercent: k.damagePercent,
        notes: k.notes,
        photoHashes: photoHashes.map((h) => h ?? ''),
      }),
      k.claimHash,
      c.claimHash,
    );
    m.check('status', k.status, CLAIM_STATUS_BY_CHAIN[Number(c.status)]);
    m.check('approvedAmount', k.approvedAmount ?? 0n, c.approvedAmount);
    const decided =
      k.status === ClaimStatus.Approved || k.status === ClaimStatus.Rejected;
    if (decided) {
      const photo = k.assessmentPhotoId
        ? await this.diskPhotoHash(k.assessmentPhotoId)
        : null;
      m.fingerprint(
        assessmentFingerprint({
          claimId: k.id,
          decision: k.status === ClaimStatus.Approved ? 'approved' : 'rejected',
          approvedAmount: k.approvedAmount,
          damagePercent: k.assessedDamagePercent,
          notes: k.assessmentNotes ?? '',
          photoHash: photo,
        }),
        k.assessmentHash,
        c.assessmentHash,
        'assessment',
      );
    }
    return m.done();
  }

  // --- Settlement ---

  private async cost(id: string): Promise<Verification> {
    const k = await this.row(ProjectCost, { id });
    if (k.costId === null) return missing();
    const c = await this.c('SettlementLedger').getCost(k.costId);
    if (c.projectId === ZERO_BYTES32) return missing();
    const m = new Mismatches();
    const photo = k.photoId ? await this.diskPhotoHash(k.photoId) : null;
    if (k.photoId && !photo) m.add('photoMissing');
    m.fingerprint(
      costFingerprint({ ...fields(k), photoHash: photo }),
      k.detailsHash,
      c.detailsHash,
    );
    m.check('amount', k.amount, c.amount);
    m.check('voided', k.status === CostStatus.Voided, c.voided);
    return m.done();
  }

  /** The round's figures, status and every payout line and payment. */
  private async round(id: number): Promise<Verification> {
    const r = await this.row(SettlementRound, { id });
    const ledger = this.c('SettlementLedger');
    const [c, lines] = await Promise.all([
      ledger.getRound(id),
      this.dataSource.getRepository(PayoutLine).findBy({ roundId: id }),
    ]);
    if (Number(c.status) === 0) return missing();
    const m = new Mismatches();
    m.check('status', r.status, ROUND_STATUS[Number(c.status)]);
    m.check('fingerprint', r.fingerprint, c.fingerprint);
    if (!r.verified) m.add('figures');
    for (const key of [
      'income',
      'costs',
      'profit',
      'farmerShare',
      'investorShare',
      'wegroShare',
      'capitalReturn',
      'leftover',
    ] as const) {
      m.check(key, r[key], c[key]);
    }
    m.check('payeeCount', r.payeeCount, Number(c.payeeCount));
    m.check('paidCount', r.paidCount, Number(c.paidCount));
    const ledgerLines = await Promise.all(
      lines.map(async (l) => {
        const payee = uuidToBytes32(l.payeeId);
        const [hash, paid] = await Promise.all([
          ledger.payoutLineHash(id, payee),
          ledger.linePaid(id, payee),
        ]);
        return { l, hash, paid };
      }),
    );
    for (const { l, hash, paid } of ledgerLines) {
      const tag = `line:${l.payeeId}`;
      m.check(`${tag}:hash`, l.lineHash, hash);
      m.check(
        `${tag}:amount`,
        l.amount === null
          ? null
          : lineHash(id, uuidToBytes32(l.payeeId), l.amount),
        hash,
      );
      m.check(`${tag}:paid`, l.paidAt !== null, paid);
    }
    return m.done();
  }

  // --- Track records ---

  private async bank(id: string): Promise<Verification> {
    const b = await this.row(Bank, { id });
    const ledger = await this.c('ConsentRegistry').bankDetails(
      uuidToBytes32(id),
    );
    if (ledger === ZERO_BYTES32) return missing();
    const m = new Mismatches();
    m.fingerprint(bankFingerprint(b), b.detailsHash, ledger);
    return m.done();
  }

  private async trackRecord(id: string): Promise<Verification> {
    const t = await this.row(TrackRecord, { id });
    if (t.version === null) return missing();
    const registry = this.c('ConsentRegistry');
    const farmer = uuidToBytes32(t.farmerId);
    const [c, projects] = await Promise.all([
      registry.getTrackRecord(farmer, t.version),
      registry.getTrackRecordProjects(farmer, t.version),
    ]);
    if (c.publishedAt === 0n) return missing();
    const m = new Mismatches();
    m.fingerprint(summaryFingerprint(t.summary), t.summaryHash, c.summaryHash);
    m.check(
      'projects',
      t.projectIds.map(uuidToBytes32).join(),
      [...projects].join(),
    );
    return m.done();
  }

  /**
   * The ledger keeps only each bank's latest grant, checked in full; an
   * earlier one is checked against its own ConsentGranted log on the ledger.
   */
  private async consent(id: string): Promise<Verification> {
    const k = await this.row(BankConsent, { id });
    if (k.status === ConsentStatus.Submitted) return missing();
    const photo = await this.diskPhotoHash(k.evidencePhotoId);
    const m = new Mismatches();
    if (!photo) m.add('photoMissing');
    const computed = consentFingerprint({
      consentId: k.id,
      farmerId: k.farmerId,
      bankId: k.bankId,
      expiresAt: k.expiresAt.getTime() / 1000,
      photoHash: photo ?? '',
    });
    const registry = this.c('ConsentRegistry');
    const farmer = uuidToBytes32(k.farmerId);
    const bank = uuidToBytes32(k.bankId);
    const c = await registry.getConsent(farmer, bank);
    if (c.grantedAt === 0n) return missing();
    if (normal(c.evidenceHash) !== normal(k.evidenceHash)) {
      // An earlier grant: a later one has taken its place on the ledger.
      const granted = await registry.queryFilter(
        registry.filters.ConsentGranted(farmer, bank),
      );
      const own = granted.find(
        (e) => normal(e.args.evidenceHash) === normal(k.evidenceHash),
      );
      if (!own) return missing();
      m.fingerprint(computed, k.evidenceHash, own.args.evidenceHash);
      m.check(
        'expiresAt',
        BigInt(k.expiresAt.getTime() / 1000),
        own.args.expiresAt,
      );
      m.check('superseded', k.status !== ConsentStatus.Active, true);
      return m.done();
    }
    m.fingerprint(computed, k.evidenceHash, c.evidenceHash);
    m.check('expiresAt', BigInt(k.expiresAt.getTime() / 1000), c.expiresAt);
    m.check('revoked', k.status === ConsentStatus.Revoked, c.revoked);
    m.check('replaced', k.status === ConsentStatus.Replaced, false);
    return m.done();
  }

  // --- Helpers ---

  private c<N extends Parameters<ContractsRegistry['get']>[0]>(name: N) {
    return this.contracts.get(name);
  }

  private async row<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    where: Partial<T>,
  ): Promise<T> {
    const row = await this.dataSource
      .getRepository(entity)
      .findOneBy(where as never);
    if (!row)
      throw new NotFoundException({
        message: 'Record not found',
        code: ErrorCode.RecordNotFound,
      });
    return row;
  }

  /** The photo's hash as the ledger has it, from the file on disk; null if missing. */
  private async diskPhotoHash(photoId: string): Promise<string | null> {
    const photo = await this.dataSource
      .getRepository(Photo)
      .findOneBy({ id: photoId });
    const sha = photo ? await this.photos.hashOnDisk(photo) : null;
    return sha ? photoHash(sha) : null;
  }
}

/** Collects what differs between the database and the ledger. */
class Mismatches {
  private readonly found: string[] = [];

  add(name: string): void {
    this.found.push(name);
  }

  check(
    name: string,
    database: unknown,
    ledger: unknown,
    opts: { onlyIf?: boolean } = {},
  ): void {
    if (opts.onlyIf === false) return;
    if (normal(database) !== normal(ledger)) this.found.push(name);
  }

  /** Recomputed, stored and on the ledger must all be the same fingerprint. */
  fingerprint(
    computed: string,
    stored: string | null,
    ledger: string,
    name = 'fingerprint',
  ): void {
    if (normal(computed) !== normal(ledger)) this.found.push(name);
    else if (normal(stored) !== normal(ledger))
      this.found.push(`${name}Stored`);
  }

  done(): Verification {
    return { onLedger: true, mismatches: this.found };
  }
}

function normal(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v.trim().toLowerCase();
  if (typeof v === 'bigint' || typeof v === 'number' || typeof v === 'boolean')
    return String(v);
  return JSON.stringify(v);
}

const missing = (): Verification => ({
  onLedger: false,
  mismatches: ['notOnLedger'],
});

function result(mismatches: string[]): Verification {
  return {
    onLedger: !mismatches.some((x) => /^not(OnLedger|Published)$/.test(x)),
    mismatches,
  };
}

function fields(k: ProjectCost) {
  return {
    id: k.id,
    projectId: k.projectId,
    category: k.category,
    amount: k.amount,
    incurredOn: k.incurredOn,
    note: k.note,
  };
}

function uuid(id: string): string {
  if (!UUID.test(id))
    throw new NotFoundException({
      message: 'Record not found',
      code: ErrorCode.RecordNotFound,
    });
  return id.toLowerCase();
}

function num(id: string): number {
  if (!NUMBER.test(id))
    throw new NotFoundException({
      message: 'Record not found',
      code: ErrorCode.RecordNotFound,
    });
  return Number(id);
}

function bytes32(id: string): string {
  if (!BYTES32.test(id))
    throw new NotFoundException({
      message: 'Record not found',
      code: ErrorCode.RecordNotFound,
    });
  return id.toLowerCase();
}
