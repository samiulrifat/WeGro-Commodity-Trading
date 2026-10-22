import { matchesWord, searchWords } from '../../common/search/words';
import { PersonSearch } from '../users/person-search';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { ChainClock } from '../../blockchain/chain-clock';
import { ReceiptApplier } from '../../blockchain/indexer/receipt-applier';
import { TransactionService } from '../../blockchain/tx/transaction.service';
import { codeToBytes32 } from '../../blockchain/utils/ids';
import { poishaToTaka, takaToPoisha } from '../../blockchain/utils/money';
import { Paginated } from '../../common/dto/pagination.dto';
import {
  BD_DISTRICTS,
  isDistrictCode,
} from '../../common/reference/bd-districts';
import { bdDate, bdDayEnd, bdLastDay } from '../../common/time/bd-dates';
import type { AuthUser } from '../auth/auth-user';
import { CatalogService } from '../catalog/catalog.service';
import { Project } from '../projects/entities/project.entity';
import { ProjectViews } from '../projects/project-views';
import { Role } from '../users/roles';
import type {
  BuyerRequestDto,
  ListRequestsQueryDto,
  PostRequestDto,
} from './dto/trade.dto';
import { BuyerRequest } from './entities/buyer-request.entity';
import { Listing } from './entities/listing.entity';
import { ListingDetails } from './entities/listing-details.entity';
import { ListingStatus, RequestStatus } from './trade.enums';
import { TradeService } from './trade.service';
import { ErrorCode } from '../../common/errors/error-code';

/** Matches shown per request. */
const MATCHES = 5;

/** Buyers' standing requests for produce (FR-19), each with the open listings that match. */
@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(BuyerRequest)
    private readonly requests: Repository<BuyerRequest>,
    @InjectRepository(Listing) private readonly listings: Repository<Listing>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    private readonly catalog: CatalogService,
    private readonly trade: TradeService,
    private readonly views: ProjectViews,
    private readonly tx: TransactionService,
    private readonly applier: ReceiptApplier,
    private readonly clock: ChainClock,
    private readonly search: PersonSearch,
  ) {}

  async post(actor: AuthUser, dto: PostRequestDto): Promise<BuyerRequestDto> {
    this.catalog.produceTypes.requireActive(dto.produceCode);
    if (dto.validUntil < bdDate(await this.clock.now())) {
      throw new UnprocessableEntityException({
        message: 'validUntil cannot be in the past',
        code: ErrorCode.VALID_UNTIL_IN_PAST,
      });
    }
    const result = await this.tx.send(actor.keyIndex, 'TradeLedger', (c) =>
      c.postRequest.populateTransaction(
        codeToBytes32(dto.produceCode),
        dto.quantity,
        takaToPoisha(dto.maxUnitPrice),
        bdDayEnd(dto.validUntil),
      ),
    );
    await this.applier.apply(result);
    return this.one(
      Number(
        result.events.find((e) => e.name === 'RequestPosted')!.args.requestId,
      ),
    );
  }

  async cancel(actor: AuthUser, id: number): Promise<BuyerRequestDto> {
    const request = await this.requests.findOneBy({ id });
    if (!request || request.status === null || request.buyerId !== actor.id) {
      throw new NotFoundException({
        message: 'Request not found',
        code: ErrorCode.REQUEST_NOT_FOUND,
      });
    }
    if (request.status !== RequestStatus.OPEN)
      throw new ConflictException({
        message: 'This request is already cancelled',
        code: ErrorCode.REQUEST_ALREADY_CANCELLED,
      });
    const result = await this.tx.send(actor.keyIndex, 'TradeLedger', (c) =>
      c.cancelRequest.populateTransaction(id),
    );
    await this.applier.apply(result);
    return this.one(id);
  }

  async list(
    actor: AuthUser,
    q: ListRequestsQueryDto,
  ): Promise<Paginated<BuyerRequestDto>> {
    const now = await this.clock.now();
    const qb = this.requests
      .createQueryBuilder('r')
      .where('r.status IS NOT NULL');
    if (!q.includeClosed) {
      qb.andWhere("r.status = 'open' AND r.valid_until > :now", { now });
    }
    if (q.produceCode)
      qb.andWhere('r.produce_code = :pc', { pc: q.produceCode });
    if (q.mine && actor.role === Role.BUYER)
      qb.andWhere('r.buyer_id = :me', { me: actor.id });
    const text = (q.q ?? '').trim();
    if (text) {
      const words = searchWords(text);
      const codes = this.catalog.produceTypes
        .list(true)
        .filter((p) =>
          words.every(
            (w) => matchesWord(p.name, w) || matchesWord(p.nameBn, w),
          ),
        )
        .map((p) => p.code);
      const buyer = this.search.condition('r.buyer_id', text, 'Buyer');
      qb.andWhere(
        new Brackets((b) => {
          b.where('1 = 0');
          if (words.length > 0 && codes.length > 0) {
            b.orWhere('r.produce_code IN (:...rcodes)', { rcodes: codes });
          }
          if (buyer) b.orWhere(buyer.sql, buyer.params);
        }),
      );
    }
    const [rows, total] = await qb
      .orderBy('r.posted_at', 'DESC')
      .addOrderBy('r.id', 'DESC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    return new Paginated(await this.dtos(rows, now), total, q);
  }

  async one(id: number): Promise<BuyerRequestDto> {
    const request = await this.requests.findOneBy({ id });
    if (!request || request.status === null)
      throw new NotFoundException({
        message: 'Request not found',
        code: ErrorCode.REQUEST_NOT_FOUND,
      });
    return (await this.dtos([request], await this.clock.now()))[0];
  }

  /**
   * Matches for a whole page in one query: open listings of the page's
   * produce, cheapest first; each request then takes those within its price.
   */
  private async dtos(
    rows: BuyerRequest[],
    now: Date,
  ): Promise<BuyerRequestDto[]> {
    if (rows.length === 0) return [];
    const codes = [...new Set(rows.map((r) => r.produceCode))];
    const open = await this.listings
      .createQueryBuilder('l')
      .where(
        'l.status = :open AND l.available > 0 AND l.produce_code IN (:...codes)',
        {
          open: ListingStatus.OPEN,
          codes,
        },
      )
      .orderBy('l.asking_unit_price', 'ASC')
      .addOrderBy('l.id', 'ASC')
      .getMany();
    const projectIds = [
      ...new Set(open.flatMap((l) => (l.projectId ? [l.projectId] : []))),
    ];
    const detailIds = open.flatMap((l) => (l.detailsId ? [l.detailsId] : []));
    const [projects, details] = await Promise.all([
      projectIds.length
        ? this.projects.find({
            where: { id: In(projectIds) },
            select: { id: true, districtCode: true },
          })
        : [],
      detailIds.length
        ? this.listings.manager.getRepository(ListingDetails).find({
            where: { id: In(detailIds) },
            select: { id: true, districtCode: true },
          })
        : [],
    ]);
    // Where each listing's produce is: its project's district, or the seller's.
    const districtOf = new Map([
      ...projects.map((p) => [p.id, p.districtCode] as const),
      ...details.map((d) => [d.id, d.districtCode] as const),
    ]);
    const district = (l: Listing) =>
      districtOf.get(l.projectId ?? l.detailsId ?? '') ?? '';
    const byProduce = new Map<string, Listing[]>();
    for (const l of open) {
      const list = byProduce.get(l.produceCode) ?? [];
      list.push(l);
      byProduce.set(l.produceCode, list);
    }
    const names = await this.views.names(rows.map((r) => r.buyerId));
    return rows.map((r) => {
      const status =
        r.status === RequestStatus.CANCELLED
          ? 'cancelled'
          : r.validUntil <= now
            ? 'expired'
            : 'open';
      const matches =
        status === 'open'
          ? (byProduce.get(r.produceCode) ?? [])
              .filter((l) => l.askingUnitPrice <= r.maxUnitPrice)
              .slice(0, MATCHES)
          : [];
      return {
        id: r.id,
        buyer: { id: r.buyerId, name: names.get(r.buyerId) ?? '' },
        produce: this.trade.produceRef(r.produceCode),
        quantity: r.quantity,
        maxUnitPrice: poishaToTaka(r.maxUnitPrice),
        validUntil: bdLastDay(Math.floor(r.validUntil.getTime() / 1000)),
        status,
        postedAt: r.postedAt,
        matchingListings: matches.map((l) => {
          const code = district(l);
          return {
            id: l.id,
            available: l.available,
            askingUnitPrice: poishaToTaka(l.askingUnitPrice),
            district: isDistrictCode(code) ? BD_DISTRICTS[code].name : code,
          };
        }),
      };
    });
  }
}
