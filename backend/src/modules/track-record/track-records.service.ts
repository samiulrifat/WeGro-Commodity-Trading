import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, MoreThan, Not, Repository } from 'typeorm';
import { ChainClock } from '../../blockchain/chain-clock';
import { ContractsRegistry } from '../../blockchain/contracts.registry';
import { ContractRevertException } from '../../blockchain/errors/contract-errors';
import { canonicalJson } from '../../blockchain/utils/fingerprint';
import { uuidToBytes32 } from '../../blockchain/utils/ids';
import { Paginated } from '../../common/dto/pagination.dto';
import {
  BD_DISTRICTS,
  isDistrictCode,
} from '../../common/reference/bd-districts';
import { bdDayEnd, bdLastDay } from '../../common/time/bd-dates';
import type { AuthUser } from '../auth/auth-user';
import { Photo } from '../field-records/entities/photo.entity';
import { photoHash, PhotosService } from '../field-records/photos.service';
import { ProjectViews } from '../projects/project-views';
import { PersonalDetails } from '../users/entities/personal-details.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/roles';
import { BanksService } from './banks.service';
import type {
  BankFarmerDto,
  BankViewDto,
  ConsentDto,
  GrantConsentDto,
  ListBankFarmersQueryDto,
  ListViewsQueryDto,
  SummaryViewDto,
  TrackRecordDto,
  TrackRecordPreviewDto,
  TrackRecordVersionDto,
} from './dto/track-record.dto';
import { Bank } from './entities/bank.entity';
import { BankConsent } from './entities/bank-consent.entity';
import { SummaryView } from './entities/summary-view.entity';
import { TrackRecord } from './entities/track-record.entity';
import { consentFingerprint } from './track-record-fingerprints';
import {
  summaryFingerprint,
  type TrackRecordSummary,
  TrackRecordBuilder,
} from './track-record-summary';
import { ConsentStatus, MAX_CONSENT_SECONDS } from './track-record.enums';

/** See any farmer's track record, consents and view log. */
const STAFF: ReadonlySet<Role> = new Set([
  Role.SuperAdmin,
  Role.Admin,
  Role.Auditor,
]);

/**
 * Track records and bank permission (ConsentRegistry). The farmer's field
 * officer publishes a summary of the farmer's finished projects, built here
 * from ledger-backed data, and grants or withdraws a bank's permission with
 * the farmer's signed form. A bank officer's every view is a logged
 * transaction, and the summary they get is checked against the ledger.
 */
@Injectable()
export class TrackRecordsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(TrackRecord)
    private readonly records: Repository<TrackRecord>,
    @InjectRepository(BankConsent)
    private readonly consents: Repository<BankConsent>,
    @InjectRepository(SummaryView)
    private readonly viewLog: Repository<SummaryView>,
    @InjectRepository(Bank) private readonly bankRows: Repository<Bank>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(PersonalDetails)
    private readonly details: Repository<PersonalDetails>,
    @InjectRepository(Photo) private readonly photoRows: Repository<Photo>,
    private readonly builder: TrackRecordBuilder,
    private readonly banks: BanksService,
    private readonly photos: PhotosService,
    private readonly views: ProjectViews,
    private readonly contracts: ContractsRegistry,
    private readonly clock: ChainClock,
  ) {}

  // --- Track records ---

  /** What would be published now. */
  async preview(
    actor: AuthUser,
    farmerId: string,
  ): Promise<TrackRecordPreviewDto> {
    await this.visibleFarmer(actor, farmerId);
    const [{ summary }, latest] = await Promise.all([
      this.build(randomUUID(), farmerId),
      this.latest(farmerId),
    ]);
    return { summary, latestVersion: latest?.version ?? null };
  }

  /**
   * The farmer's officer publishes a new version, built here from the
   * farmer's finished projects; nothing in it comes from the request.
   */
  async publish(actor: AuthUser, farmerId: string): Promise<TrackRecordDto> {
    await this.requireOfficer(actor, farmerId);
    const id = randomUUID();
    const [{ summary, projectIds }, latest] = await Promise.all([
      this.build(id, farmerId),
      this.latest(farmerId),
    ]);
    if (projectIds.length === 0) {
      throw new ConflictException({
        message: 'The farmer has no finished projects yet',
        code: 'NO_FINISHED_PROJECTS',
      });
    }
    if (latest && sameContent(latest.summary, summary)) {
      throw new ConflictException({
        message: `Nothing changed since version ${latest.version}`,
        code: 'UNCHANGED',
      });
    }
    const summaryHash = summaryFingerprint(summary);
    await this.records.insert({
      id,
      farmerId,
      version: null,
      summary,
      summaryHash,
      projectIds,
      publishedById: actor.id,
      status: 'submitted',
      publishedAt: null,
    });
    let version: number;
    try {
      const result = await this.banks.send(actor, (c) =>
        c.publishTrackRecord.populateTransaction(
          uuidToBytes32(farmerId),
          projectIds.map(uuidToBytes32),
          summaryHash,
        ),
      );
      version = Number(
        result.events.find((e) => e.name === 'TrackRecordPublished')!.args
          .version,
      );
    } catch (error) {
      if (error instanceof ContractRevertException)
        await this.records.delete({ id, status: 'submitted' });
      throw error;
    }
    return this.record(actor, farmerId, version);
  }

  async versions(
    actor: AuthUser,
    farmerId: string,
  ): Promise<TrackRecordVersionDto[]> {
    await this.visibleFarmer(actor, farmerId);
    const rows = await this.records.find({
      where: { farmerId, status: 'recorded' },
      select: {
        id: true,
        version: true,
        publishedAt: true,
        publishedById: true,
        projectIds: true,
        summaryHash: true,
      },
      order: { version: 'DESC' },
    });
    const names = await this.views.names(rows.map((r) => r.publishedById));
    return rows.map((r) => this.versionView(r, names));
  }

  /** One version, checked against the fingerprint the ledger holds for it. */
  async record(
    actor: AuthUser,
    farmerId: string,
    version: number,
  ): Promise<TrackRecordDto> {
    await this.visibleFarmer(actor, farmerId);
    const row = await this.records.findOneBy({
      farmerId,
      version,
      status: 'recorded',
    });
    if (!row) throw new NotFoundException('No such version');
    const [onChain, names] = await Promise.all([
      this.registry().getTrackRecord(uuidToBytes32(farmerId), version),
      this.views.names([row.publishedById]),
    ]);
    return {
      ...this.versionView(row, names),
      summary: row.summary,
      verified: matches(row, onChain.summaryHash),
    };
  }

  // --- Consent ---

  /**
   * The farmer's officer records the farmer's permission for a bank, until a
   * day at most a year ahead, with the photo of the signed consent form. A
   * new grant for the same bank renews it.
   */
  async grant(
    actor: AuthUser,
    farmerId: string,
    dto: GrantConsentDto,
  ): Promise<ConsentDto> {
    await this.requireOfficer(actor, farmerId);
    const bank = await this.bankRows.findOneBy({ id: dto.bankId });
    if (!bank || bank.status !== 'registered')
      throw new NotFoundException('Bank not found');
    const now = Math.floor((await this.clock.now()).getTime() / 1000);
    const expiresAt = bdDayEnd(dto.expiresOn);
    if (expiresAt <= now) {
      throw new UnprocessableEntityException(
        'expiresOn must be today or later',
      );
    }
    if (expiresAt > now + MAX_CONSENT_SECONDS) {
      throw new UnprocessableEntityException({
        message: 'Permission lasts at most a year; renew it when it ends',
        code: 'EXPIRY_TOO_LATE',
        details: { latest: bdLastDay(now + MAX_CONSENT_SECONDS) },
      });
    }
    const photo = await this.photoRows.findOneBy({
      id: dto.evidencePhotoId,
      uploadedById: actor.id,
    });
    if (!photo) {
      throw new UnprocessableEntityException(
        'evidencePhotoId must be a photo you uploaded',
      );
    }
    const id = randomUUID();
    const evidenceHash = consentFingerprint({
      consentId: id,
      farmerId,
      bankId: bank.id,
      expiresAt,
      photoHash: photoHash(photo.sha256),
    });
    await this.consents.insert({
      id,
      farmerId,
      bankId: bank.id,
      expiresAt: new Date(expiresAt * 1000),
      evidencePhotoId: photo.id,
      evidenceHash,
      grantedById: actor.id,
      status: ConsentStatus.Submitted,
    });
    try {
      await this.banks.send(actor, (c) =>
        c.grantConsent.populateTransaction(
          uuidToBytes32(farmerId),
          uuidToBytes32(bank.id),
          expiresAt,
          evidenceHash,
        ),
      );
    } catch (error) {
      if (error instanceof ContractRevertException)
        await this.consents.delete({ id, status: ConsentStatus.Submitted });
      throw error;
    }
    return this.consentOne(id);
  }

  /** The farmer withdraws permission; the bank's access ends at once. */
  async revoke(
    actor: AuthUser,
    farmerId: string,
    bankId: string,
  ): Promise<ConsentDto> {
    await this.requireOfficer(actor, farmerId);
    const current = await this.current(farmerId, bankId);
    if (!current) {
      throw new ConflictException({
        message: 'This bank has no current permission to withdraw',
        code: 'NO_ACTIVE_CONSENT',
      });
    }
    await this.banks.send(actor, (c) =>
      c.revokeConsent.populateTransaction(
        uuidToBytes32(farmerId),
        uuidToBytes32(bankId),
      ),
    );
    return this.consentOne(current.id);
  }

  /** Every grant for the farmer, newest first, with how often each bank looked. */
  async listConsents(actor: AuthUser, farmerId: string): Promise<ConsentDto[]> {
    await this.visibleFarmer(actor, farmerId);
    const rows = await this.consents.find({
      where: { farmerId, status: Not(ConsentStatus.Submitted) },
      order: { createdAt: 'DESC' },
    });
    return this.consentDtos(rows);
  }

  async evidencePhoto(actor: AuthUser, consentId: string): Promise<Photo> {
    const row = await this.consents.findOneBy({ id: consentId });
    if (!row || row.status === ConsentStatus.Submitted)
      throw new NotFoundException('Consent not found');
    await this.visibleFarmer(actor, row.farmerId);
    return this.photos.find(row.evidencePhotoId);
  }

  /** Who viewed the farmer's track record, newest first. */
  async viewHistory(
    actor: AuthUser,
    farmerId: string,
    q: ListViewsQueryDto,
  ): Promise<Paginated<SummaryViewDto>> {
    await this.visibleFarmer(actor, farmerId);
    const [rows, total] = await this.viewLog.findAndCount({
      where: { farmerId },
      order: { viewedAt: 'DESC', blockNumber: 'DESC', logIndex: 'DESC' },
      skip: q.skip,
      take: q.limit,
    });
    const [banks, names] = await Promise.all([
      this.banks.names(rows.map((r) => r.bankId)),
      this.views.names(rows.map((r) => r.viewerId)),
    ]);
    return new Paginated(
      rows.map((r) => ({
        bank: { id: r.bankId, name: banks.get(r.bankId) ?? '' },
        viewer: { id: r.viewerId, name: names.get(r.viewerId) ?? '' },
        version: r.version,
        viewedAt: r.viewedAt,
      })),
      total,
      q,
    );
  }

  // --- Bank officers ---

  /** Farmers whose permission for the officer's bank is current. */
  async bankFarmers(
    actor: AuthUser,
    q: ListBankFarmersQueryDto,
  ): Promise<Paginated<BankFarmerDto>> {
    const bankId = await this.requireBank(actor);
    const [rows, total] = await this.consents.findAndCount({
      where: {
        bankId,
        status: ConsentStatus.Active,
        expiresAt: MoreThan(await this.clock.now()),
      },
      order: { grantedAt: 'DESC' },
      skip: q.skip,
      take: q.limit,
    });
    const farmerIds = rows.map((r) => r.farmerId);
    const [names, districts, latest] = await Promise.all([
      this.views.names(farmerIds),
      farmerIds.length
        ? this.details.find({
            where: { userId: In(farmerIds) },
            select: { userId: true, district: true },
          })
        : [],
      farmerIds.length
        ? this.dataSource.query<Array<{ farmer_id: string; version: number }>>(
            `SELECT farmer_id, MAX(version) AS version FROM track_records
              WHERE farmer_id = ANY($1) AND status = 'recorded' GROUP BY farmer_id`,
            [farmerIds],
          )
        : [],
    ]);
    const districtOf = new Map(districts.map((d) => [d.userId, d.district]));
    const latestOf = new Map(latest.map((l) => [l.farmer_id, l.version]));
    return new Paginated(
      rows.map((r) => {
        const district = districtOf.get(r.farmerId) ?? null;
        return {
          farmer: { id: r.farmerId, name: names.get(r.farmerId) ?? '' },
          district:
            district && isDistrictCode(district)
              ? BD_DISTRICTS[district].name
              : district,
          expiresOn: lastDay(r.expiresAt),
          latestVersion: latestOf.get(r.farmerId) ?? null,
        };
      }),
      total,
      q,
    );
  }

  /**
   * A bank officer views a farmer's latest track record. The view is a
   * transaction from the officer's own key, refused on the ledger without
   * current permission and logged there; the summary returned is checked
   * against the fingerprint the ledger gave.
   */
  async bankView(actor: AuthUser, farmerId: string): Promise<BankViewDto> {
    const bankId = await this.requireBank(actor);
    if (!(await this.current(farmerId, bankId))) {
      throw new ForbiddenException({
        message: 'This farmer has not given your bank permission',
        code: 'NO_ACTIVE_CONSENT',
      });
    }
    if (!(await this.latest(farmerId))) {
      throw new NotFoundException({
        message: 'This farmer has no track record yet',
        code: 'NO_TRACK_RECORD',
      });
    }
    const result = await this.banks.send(actor, (c) =>
      c.viewSummary.populateTransaction(uuidToBytes32(farmerId)),
    );
    const viewed = result.events.find((e) => e.name === 'SummaryViewed')!;
    const version = Number(viewed.args.version);
    const [row, onChain, names] = await Promise.all([
      this.records.findOneByOrFail({ farmerId, version }),
      this.registry().getTrackRecord(uuidToBytes32(farmerId), version),
      this.views.names([farmerId]),
    ]);
    return {
      farmer: { id: farmerId, name: names.get(farmerId) ?? '' },
      version,
      publishedAt: row.publishedAt!,
      summary: row.summary,
      summaryHash: onChain.summaryHash,
      verified: matches(row, onChain.summaryHash),
      viewedAt: result.blockTime,
      txHash: result.hash,
    };
  }

  // --- Rules ---

  /** Staff see every farmer; a farmer themselves; an officer their farmers. */
  private async visibleFarmer(
    actor: AuthUser,
    farmerId: string,
  ): Promise<void> {
    const farmer = await this.users.findOne({
      where: { id: farmerId },
      select: { id: true, role: true, fieldOfficerId: true },
    });
    const allowed =
      !!farmer &&
      farmer.role === Role.Farmer &&
      (STAFF.has(actor.role) ||
        farmer.id === actor.id ||
        (actor.role === Role.FieldOfficer &&
          farmer.fieldOfficerId === actor.id));
    if (!allowed) throw new NotFoundException('Farmer not found');
  }

  /** Only the farmer's own field officer publishes, grants and withdraws. */
  private async requireOfficer(
    actor: AuthUser,
    farmerId: string,
  ): Promise<void> {
    await this.visibleFarmer(actor, farmerId);
    const isOfficer =
      actor.role === Role.FieldOfficer &&
      (await this.users.exists({
        where: { id: farmerId, fieldOfficerId: actor.id },
      }));
    if (!isOfficer) {
      throw new ForbiddenException(
        "Only the farmer's field officer can do this",
      );
    }
  }

  private async requireBank(actor: AuthUser): Promise<string> {
    const bankId = await this.banks.bankOf(actor.id);
    if (!bankId) {
      throw new ForbiddenException({
        message: 'You are not assigned to a bank',
        code: 'NOT_ASSIGNED_TO_BANK',
      });
    }
    return bankId;
  }

  /** The bank's permission if it is active and not expired (by the ledger's clock). */
  private async current(
    farmerId: string,
    bankId: string,
  ): Promise<BankConsent | null> {
    return this.consents.findOneBy({
      farmerId,
      bankId,
      status: ConsentStatus.Active,
      expiresAt: MoreThan(await this.clock.now()),
    });
  }

  private latest(farmerId: string): Promise<TrackRecord | null> {
    return this.records.findOne({
      where: { farmerId, status: 'recorded' },
      order: { version: 'DESC' },
    });
  }

  private async build(recordId: string, farmerId: string) {
    const [names, details, now] = await Promise.all([
      this.views.names([farmerId]),
      this.details.findOne({
        where: { userId: farmerId },
        select: { userId: true, district: true },
      }),
      this.clock.now(),
    ]);
    return this.builder.build({
      recordId,
      farmer: {
        id: farmerId,
        name: names.get(farmerId) ?? '',
        districtCode: details?.district ?? null,
      },
      now,
    });
  }

  private registry() {
    return this.contracts.get('ConsentRegistry');
  }

  // --- Views ---

  private versionView(
    r: TrackRecord,
    names: Map<string, string>,
  ): Plain<TrackRecordVersionDto> {
    return {
      version: r.version!,
      publishedAt: r.publishedAt!,
      publishedBy: {
        id: r.publishedById,
        name: names.get(r.publishedById) ?? '',
      },
      projects: r.projectIds.length,
      summaryHash: r.summaryHash,
    };
  }

  private async consentOne(id: string): Promise<ConsentDto> {
    const row = await this.consents.findOneByOrFail({ id });
    return (await this.consentDtos([row]))[0];
  }

  /** Bank names, people and view counts for all rows in three queries. */
  private async consentDtos(rows: BankConsent[]): Promise<ConsentDto[]> {
    if (rows.length === 0) return [];
    const farmerId = rows[0].farmerId;
    const [banks, names, counts, now] = await Promise.all([
      this.banks.names(rows.map((r) => r.bankId)),
      this.views.names(rows.map((r) => r.grantedById)),
      this.dataSource.query<
        Array<{ bank_id: string; views: string; last: Date }>
      >(
        `SELECT bank_id, COUNT(*) AS views, MAX(viewed_at) AS last
           FROM summary_views WHERE farmer_id = $1 GROUP BY bank_id`,
        [farmerId],
      ),
      this.clock.now(),
    ]);
    const viewsOf = new Map(counts.map((c) => [c.bank_id, c]));
    return rows.map((r) => {
      const v = viewsOf.get(r.bankId);
      return {
        id: r.id,
        bank: { id: r.bankId, name: banks.get(r.bankId) ?? '' },
        status: r.status,
        current: r.status === ConsentStatus.Active && r.expiresAt > now,
        expiresOn: lastDay(r.expiresAt),
        expiresAt: r.expiresAt,
        grantedBy: {
          id: r.grantedById,
          name: names.get(r.grantedById) ?? '',
        },
        grantedAt: r.grantedAt,
        revokedAt: r.revokedAt,
        evidencePhotoUrl: `/api/consents/${r.id}/evidence-photo`,
        evidenceHash: r.evidenceHash,
        views: v ? Number(v.views) : 0,
        lastViewedAt: v?.last ?? null,
      };
    });
  }
}

/** A DTO's fields as a plain object type, so views can be spread into larger ones. */
type Plain<T> = { [K in keyof T]: T[K] };

const lastDay = (expiresAt: Date) => bdLastDay(expiresAt.getTime() / 1000);

/** The stored summary still produces the hash stored with it and the ledger's. */
function matches(row: TrackRecord, ledgerHash: string): boolean {
  return (
    row.summaryHash === ledgerHash &&
    summaryFingerprint(row.summary) === ledgerHash
  );
}

/** Same farmer, projects and totals: publishing again would add nothing. */
function sameContent(a: TrackRecordSummary, b: TrackRecordSummary): boolean {
  const content = (s: TrackRecordSummary) =>
    canonicalJson({ farmer: s.farmer, projects: s.projects, totals: s.totals });
  return content(a) === content(b);
}
