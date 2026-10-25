import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, MoreThan, Not, Repository } from 'typeorm';
import { ChainClock } from '../../blockchain/chain-clock';
import { ContractsRegistry } from '../../blockchain/contracts.registry';
import { ContractRevertException } from '../../blockchain/errors/contract-errors';
import { canonicalJson } from '../../blockchain/utils/fingerprint';
import { uuidToBytes32 } from '../../blockchain/utils/ids';
import { Paginated } from '../../common/dto/pagination.dto';
import { matchesWord, searchWords } from '../../common/search/words';
import {
  BD_DISTRICTS,
  isDistrictCode,
} from '../../common/reference/bd-districts';
import {
  bdDayEnd,
  bdLastDay,
  bdLastDayWithin,
} from '../../common/time/bd-dates';
import type { AuthUser } from '../auth/auth-user';
import { Photo } from '../field-records/entities/photo.entity';
import { photoHash, PhotosService } from '../field-records/photos.service';
import { ProjectViews } from '../projects/project-views';
import { PersonalDetails } from '../users/entities/personal-details.entity';
import { User } from '../users/entities/user.entity';
import { PersonSearch } from '../users/person-search';
import { ParticipantStatus, Role } from '../users/roles';
import { BanksService } from './banks.service';
import type {
  ListAllConsentsQueryDto,
  ListTrackRecordFarmersQueryDto,
  TrackRecordFarmerDto,
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
  type ImportedProject,
  summaryFingerprint,
  type TrackRecordSummary,
  TrackRecordBuilder,
} from './track-record-summary';
import {
  ConsentStatus,
  FINISHED_STAGES,
  MAX_CONSENT_SECONDS,
  MAX_PROJECTS_PER_RECORD,
} from './track-record.enums';
import { ErrorCode } from '../../common/errors/error-code';

/**
 * Whether farmer `u` has finished projects that their latest published
 * version does not hold, among those a new version would hold (the newest
 * 50, ranked as TrackRecordBuilder picks them). False before any version.
 */
const PENDING_ADDITIONS = `EXISTS (
  SELECT 1
    FROM (SELECT t.project_ids FROM track_records t
           WHERE t.farmer_id = u.id AND t.status = 'recorded'
           ORDER BY t.version DESC LIMIT 1) l,
         (SELECT p.id, ROW_NUMBER() OVER (ORDER BY p.finished_at DESC NULLS LAST, p.id) AS rn
            FROM projects p WHERE p.farmer_id = u.id AND p.stage IN (:...finishedStages)) r
   WHERE r.rn <= :maxProjects AND NOT (r.id = ANY(l.project_ids)))`;

/** See any farmer's track record, consents and view log. */
const STAFF: ReadonlySet<Role> = new Set([
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.AUDITOR,
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
    private readonly search: PersonSearch,
  ) {}

  // --- Track records ---

  /** What would be published now. */
  async preview(
    actor: AuthUser,
    farmerId: string,
  ): Promise<TrackRecordPreviewDto> {
    await this.visibleFarmer(actor, farmerId);
    const [{ summary, projectIds }, latest] = await Promise.all([
      this.build(randomUUID(), farmerId),
      this.latest(farmerId),
    ]);
    const held = new Set(latest?.projectIds);
    return {
      summary,
      officer: await this.officerOf(farmerId),
      latestVersion: latest?.version ?? null,
      pendingProjects: latest
        ? projectIds.filter((id) => !held.has(id)).length
        : 0,
    };
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
        code: ErrorCode.NO_FINISHED_PROJECTS,
      });
    }
    if (latest && sameContent(latest.summary, summary)) {
      throw new ConflictException({
        message: `Nothing changed since version ${latest.version}`,
        code: ErrorCode.UNCHANGED,
        details: { version: latest.version },
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
    if (!row)
      throw new NotFoundException({
        message: 'No such version',
        code: ErrorCode.VERSION_NOT_FOUND,
      });
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

  /** Finished projects imported from WeGro's records (off the ledger). */
  async importedHistory(
    actor: AuthUser,
    farmerId: string,
  ): Promise<ImportedProject[]> {
    await this.visibleFarmer(actor, farmerId);
    return this.builder.importedHistory(farmerId);
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
      throw new NotFoundException({
        message: 'Bank not found',
        code: ErrorCode.BANK_NOT_FOUND,
      });
    const now = Math.floor((await this.clock.now()).getTime() / 1000);
    const expiresAt = bdDayEnd(dto.expiresOn);
    if (expiresAt <= now) {
      throw new UnprocessableEntityException({
        message: 'expiresOn must be today or later',
        code: ErrorCode.EXPIRY_IN_PAST,
      });
    }
    if (expiresAt > now + MAX_CONSENT_SECONDS) {
      throw new UnprocessableEntityException({
        message: 'Permission lasts at most a year; renew it when it ends',
        code: ErrorCode.EXPIRY_TOO_LATE,
        details: { latest: bdLastDayWithin(now + MAX_CONSENT_SECONDS) },
      });
    }
    const photo = await this.photoRows.findOneBy({
      id: dto.evidencePhotoId,
      uploadedById: actor.id,
    });
    if (!photo) {
      throw new UnprocessableEntityException({
        message: 'evidencePhotoId must be a photo you uploaded',
        code: ErrorCode.PHOTO_NOT_YOURS,
      });
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
      status: ConsentStatus.SUBMITTED,
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
        await this.consents.delete({ id, status: ConsentStatus.SUBMITTED });
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
        code: ErrorCode.NO_CONSENT_TO_WITHDRAW,
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
      where: { farmerId, status: Not(ConsentStatus.SUBMITTED) },
      order: { createdAt: 'DESC' },
    });
    return this.consentDtos(rows);
  }

  async evidencePhoto(actor: AuthUser, consentId: string): Promise<Photo> {
    const row = await this.consents.findOneBy({ id: consentId });
    if (!row || row.status === ConsentStatus.SUBMITTED)
      throw new NotFoundException({
        message: 'Consent not found',
        code: ErrorCode.CONSENT_NOT_FOUND,
      });
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

  // --- Lists across farmers ---

  /**
   * Farmers with where their track record and bank permissions stand: every
   * farmer for staff, an officer's own farmers. Searched as people; filtered
   * by whether a record is published. One query for the page, then one
   * grouped query each for records, finished projects and permissions.
   */
  async farmers(
    actor: AuthUser,
    q: ListTrackRecordFarmersQueryDto,
  ): Promise<Paginated<TrackRecordFarmerDto>> {
    const qb = this.users
      .createQueryBuilder('u')
      .where('u.role = :farmer AND u.status = :verified', {
        farmer: Role.FARMER,
        verified: ParticipantStatus.VERIFIED,
      });
    if (actor.role === Role.FIELD_OFFICER) {
      qb.andWhere('u.field_officer_id = :me', { me: actor.id });
    }
    const published = `EXISTS (SELECT 1 FROM track_records t WHERE t.farmer_id = u.id AND t.status = 'recorded')`;
    if (q.state === 'published') qb.andWhere(published);
    if (q.state === 'not_published') qb.andWhere(`NOT ${published}`);
    if (q.state === 'pending_additions') {
      qb.andWhere(PENDING_ADDITIONS, {
        finishedStages: [...FINISHED_STAGES],
        maxProjects: MAX_PROJECTS_PER_RECORD,
      });
    }
    this.search.apply(qb, 'u.id', q.q);
    const [rows, total] = await qb
      .orderBy('u.created_at', 'DESC')
      .addOrderBy('u.id', 'DESC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    const ids = rows.map((u) => u.id);
    if (ids.length === 0) return new Paginated([], total, q);
    const now = await this.clock.now();
    const [records, finished, permissions, districts, names] =
      await Promise.all([
        this.dataSource.query<
          Array<{
            farmer_id: string;
            version: number;
            published_at: Date;
            project_ids: string[];
          }>
        >(
          `SELECT DISTINCT ON (farmer_id) farmer_id, version, published_at, project_ids
             FROM track_records
            WHERE farmer_id = ANY($1) AND status = 'recorded'
            ORDER BY farmer_id, version DESC`,
          [ids],
        ),
        // Newest first, ranked as the builder picks a version's projects.
        this.dataSource.query<Array<{ farmer_id: string; id: string }>>(
          `SELECT farmer_id, id FROM projects
            WHERE farmer_id = ANY($1) AND stage = ANY($2)
            ORDER BY farmer_id, finished_at DESC NULLS LAST, id`,
          [ids, FINISHED_STAGES],
        ),
        this.dataSource.query<Array<{ farmer_id: string; n: string }>>(
          `SELECT farmer_id, COUNT(*) AS n FROM bank_consents
            WHERE farmer_id = ANY($1) AND status = 'active' AND expires_at > $2 GROUP BY farmer_id`,
          [ids, now],
        ),
        this.details.find({
          where: { userId: In(ids) },
          select: { userId: true, district: true },
        }),
        this.views.names([
          ...ids,
          ...rows.flatMap((u) => (u.fieldOfficerId ? [u.fieldOfficerId] : [])),
        ]),
      ]);
    const recordOf = new Map(records.map((r) => [r.farmer_id, r]));
    const finishedOf = new Map<string, string[]>();
    for (const p of finished) {
      const list = finishedOf.get(p.farmer_id);
      if (list) list.push(p.id);
      else finishedOf.set(p.farmer_id, [p.id]);
    }
    const permissionsOf = new Map(
      permissions.map((r) => [r.farmer_id, Number(r.n)]),
    );
    const districtOf = new Map(districts.map((d) => [d.userId, d.district]));
    return new Paginated(
      rows.map((u) => {
        const district = districtOf.get(u.id) ?? null;
        const record = recordOf.get(u.id);
        const done = finishedOf.get(u.id) ?? [];
        const held = new Set(record?.project_ids);
        return {
          farmer: { id: u.id, name: names.get(u.id) ?? '' },
          district:
            district && isDistrictCode(district)
              ? BD_DISTRICTS[district].name
              : district,
          officer: u.fieldOfficerId
            ? {
                id: u.fieldOfficerId,
                name: names.get(u.fieldOfficerId) ?? '',
              }
            : null,
          finishedProjects: done.length,
          latestVersion: record?.version ?? null,
          publishedAt: record?.published_at ?? null,
          pendingProjects: record
            ? done
                .slice(0, MAX_PROJECTS_PER_RECORD)
                .filter((id) => !held.has(id)).length
            : 0,
          currentPermissions: permissionsOf.get(u.id) ?? 0,
        };
      }),
      total,
      q,
    );
  }

  /**
   * Bank permissions across farmers (staff; an officer's own farmers'),
   * newest first: filtered by where they stand and by bank, searched by the
   * farmer or the bank's name.
   */
  async allConsents(
    actor: AuthUser,
    q: ListAllConsentsQueryDto,
  ): Promise<Paginated<ConsentDto>> {
    const now = await this.clock.now();
    const qb = this.consents
      .createQueryBuilder('c')
      .where('c.status IN (:...shown)', {
        shown: [ConsentStatus.ACTIVE, ConsentStatus.REVOKED],
      });
    if (actor.role === Role.FIELD_OFFICER) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM users f WHERE f.id = c.farmer_id AND f.field_officer_id = :me)',
        { me: actor.id },
      );
    }
    if (q.state === 'current')
      qb.andWhere("c.status = 'active' AND c.expires_at > :now", { now });
    if (q.state === 'expired')
      qb.andWhere("c.status = 'active' AND c.expires_at <= :now", { now });
    if (q.state === 'revoked') qb.andWhere("c.status = 'revoked'");
    if (q.bankId) qb.andWhere('c.bank_id = :bank', { bank: q.bankId });
    const text = (q.q ?? '').trim();
    if (text) {
      const words = searchWords(text);
      const banks =
        words.length === 0
          ? []
          : (
              await this.bankRows.find({
                select: { id: true, name: true, branchName: true },
              })
            )
              .filter((b) =>
                words.every(
                  (w) => matchesWord(b.name, w) || matchesWord(b.branchName, w),
                ),
              )
              .map((b) => b.id);
      const farmer = this.search.condition('c.farmer_id', text, 'Farmer');
      qb.andWhere(
        new Brackets((b) => {
          b.where('1 = 0');
          if (farmer) b.orWhere(farmer.sql, farmer.params);
          if (banks.length > 0)
            b.orWhere('c.bank_id IN (:...qbanks)', { qbanks: banks });
        }),
      );
    }
    const [rows, total] = await qb
      .orderBy('c.created_at', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    return new Paginated(await this.consentDtos(rows), total, q);
  }

  // --- Bank officers ---

  /** Farmers whose permission for the officer's bank is current. */
  async bankFarmers(
    actor: AuthUser,
    q: ListBankFarmersQueryDto,
  ): Promise<Paginated<BankFarmerDto>> {
    const bankId = await this.requireBank(actor);
    const qb = this.consents
      .createQueryBuilder('c')
      .where(
        'c.bank_id = :bankId AND c.status = :active AND c.expires_at > :now',
        {
          bankId,
          active: ConsentStatus.ACTIVE,
          now: await this.clock.now(),
        },
      );
    this.search.apply(qb, 'c.farmer_id', q.q);
    const [rows, total] = await qb
      .orderBy('c.granted_at', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
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
        code: ErrorCode.NO_ACTIVE_CONSENT,
      });
    }
    if (!(await this.latest(farmerId))) {
      throw new NotFoundException({
        message: 'This farmer has no track record yet',
        code: ErrorCode.NO_TRACK_RECORD,
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
      farmer.role === Role.FARMER &&
      (STAFF.has(actor.role) ||
        farmer.id === actor.id ||
        (actor.role === Role.FIELD_OFFICER &&
          farmer.fieldOfficerId === actor.id));
    if (!allowed)
      throw new NotFoundException({
        message: 'Farmer not found',
        code: ErrorCode.FARMER_NOT_FOUND,
      });
  }

  /**
   * Only the farmer's own field officer publishes, grants and withdraws, or
   * the super admin (for a farmer whose officer is gone), as on the ledger.
   */
  private async requireOfficer(
    actor: AuthUser,
    farmerId: string,
  ): Promise<void> {
    await this.visibleFarmer(actor, farmerId);
    if (actor.role === Role.SUPER_ADMIN) return;
    const isOfficer =
      actor.role === Role.FIELD_OFFICER &&
      (await this.users.exists({
        where: { id: farmerId, fieldOfficerId: actor.id },
      }));
    if (!isOfficer) {
      throw new ForbiddenException({
        message:
          "Only the farmer's field officer or the super admin can do this",
        code: ErrorCode.NOT_FARMERS_OFFICER,
      });
    }
  }

  private async requireBank(actor: AuthUser): Promise<string> {
    const bankId = await this.banks.bankOf(actor.id);
    if (!bankId) {
      throw new ForbiddenException({
        message: 'You are not assigned to a bank',
        code: ErrorCode.NOT_ASSIGNED_TO_BANK,
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
      status: ConsentStatus.ACTIVE,
      expiresAt: MoreThan(await this.clock.now()),
    });
  }

  /** The farmer's field officer, or null when they have none. */
  private async officerOf(
    farmerId: string,
  ): Promise<{ id: string; name: string } | null> {
    const farmer = await this.users.findOne({
      where: { id: farmerId },
      select: { id: true, fieldOfficerId: true },
    });
    if (!farmer?.fieldOfficerId) return null;
    const names = await this.views.names([farmer.fieldOfficerId]);
    return {
      id: farmer.fieldOfficerId,
      name: names.get(farmer.fieldOfficerId) ?? '',
    };
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

  /**
   * Bank names, people and view counts for all rows in three queries. A
   * grant counts the views made while it stood: from its grant until it was
   * withdrawn or the next grant for the same bank renewed it.
   */
  private async consentDtos(rows: BankConsent[]): Promise<ConsentDto[]> {
    if (rows.length === 0) return [];
    const farmerIds = [...new Set(rows.map((r) => r.farmerId))];
    const [banks, names, counts, now] = await Promise.all([
      this.banks.names(rows.map((r) => r.bankId)),
      this.views.names([...rows.map((r) => r.grantedById), ...farmerIds]),
      this.dataSource.query<Array<{ id: string; views: string; last: Date }>>(
        `WITH g AS (
           SELECT id, farmer_id, bank_id, granted_at,
                  COALESCE(revoked_at, LEAD(granted_at) OVER (
                    PARTITION BY farmer_id, bank_id ORDER BY granted_at, id)) AS ended
             FROM bank_consents
            WHERE farmer_id = ANY($1) AND granted_at IS NOT NULL)
         SELECT g.id, COUNT(*) AS views, MAX(v.viewed_at) AS last
           FROM g JOIN summary_views v
             ON v.farmer_id = g.farmer_id AND v.bank_id = g.bank_id
            AND v.viewed_at >= g.granted_at
            AND (g.ended IS NULL OR v.viewed_at < g.ended)
          WHERE g.id = ANY($2)
          GROUP BY g.id`,
        [farmerIds, rows.map((r) => r.id)],
      ),
      this.clock.now(),
    ]);
    const viewsOf = new Map(counts.map((c) => [c.id, c]));
    return rows.map((r) => {
      const v = viewsOf.get(r.id);
      return {
        id: r.id,
        farmer: { id: r.farmerId, name: names.get(r.farmerId) ?? '' },
        bank: { id: r.bankId, name: banks.get(r.bankId) ?? '' },
        status: r.status,
        current: r.status === ConsentStatus.ACTIVE && r.expiresAt > now,
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
    canonicalJson({
      farmer: s.farmer,
      projects: s.projects,
      totals: s.totals,
      importedHistory: s.importedHistory ?? [],
    });
  return content(a) === content(b);
}
