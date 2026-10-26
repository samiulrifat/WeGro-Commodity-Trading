import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ChainClock } from '../../blockchain/chain-clock';
import { poishaToTaka } from '../../blockchain/utils/money';
import { addMonths, bdDate, bdDayStart } from '../../common/time/bd-dates';
import type { AuthUser } from '../auth/auth-user';
import { ProjectViews } from '../projects/project-views';
import type {
  ActiveProjectDto,
  DashboardDto,
  FiguresDto,
  FundingProjectDto,
  QueueDto,
  TrendsDto,
} from './dto/dashboard.dto';
import { ITEM_MONEY, type QueueDef, queuesFor } from './dashboard-queues';

/** Figures and trends are sums over whole tables: computed at most this often. */
const FIGURES_TTL_MS = 60_000;
const LIST_LIMIT = 20;
const DAY_MS = 86_400_000;

interface QueueRow {
  id: string;
  title: string;
  detail: string | null;
  person_id: string | null;
  project_id: string | null;
  project_title: string | null;
  since: Date;
  params: Record<string, string | number | boolean | null> | null;
}

interface Cached {
  at: Date;
  figures: FiguresDto;
  trends: TrendsDto;
}

/**
 * The staff dashboard: funding progress, active projects, projects by stage,
 * the queues the caller's role acts on, and all-time figures with 12-month
 * trends. Everything comes from the database in one round of parallel,
 * index-backed queries, plus one query for every name on the page. Figures
 * and trends are cached for a minute and computed once however many
 * requests arrive together.
 */
@Injectable()
export class DashboardService {
  private cached: Cached | null = null;
  private computing: Promise<Cached> | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly views: ProjectViews,
    private readonly clock: ChainClock,
  ) {}

  async dashboard(actor: AuthUser): Promise<DashboardDto> {
    const now = await this.clock.now();
    const [funding, stages, active, queues, cached] = await Promise.all([
      this.funding(),
      this.stages(),
      this.active(),
      Promise.all(queuesFor(actor.role).map((q) => this.queue(q, now))),
      this.figures(now),
    ]);
    const names = await this.views.names([
      ...funding.rows.map((r) => r.farmer_id),
      ...active.rows.map((r) => r.farmer_id),
      ...queues.flatMap(({ rows }) =>
        rows.flatMap((r) => (r.person_id ? [r.person_id] : [])),
      ),
    ]);
    const today = bdDate(now);
    return {
      asOf: now,
      funding: {
        openProjects: funding.count,
        target: poishaToTaka(funding.target),
        raised: poishaToTaka(funding.raised),
        percentFunded: percent(funding.raised, funding.target),
        projects: funding.rows.map((r): FundingProjectDto => ({
          project: { id: r.id, name: r.title },
          farmer: { id: r.farmer_id, name: names.get(r.farmer_id) ?? '' },
          produceCode: r.produce_code,
          districtCode: r.district_code,
          target: poishaToTaka(BigInt(r.target)),
          raised: poishaToTaka(BigInt(r.raised)),
          percentFunded: percent(BigInt(r.issued_slots), BigInt(r.total_slots)),
          totalSlots: Number(r.total_slots),
          issuedSlots: r.issued_slots,
          reservedSlots: r.reserved_slots,
          pendingReservations: Number(r.pending_reservations),
          publishedAt: r.published_at,
          daysOpen: r.published_at
            ? Math.floor((now.getTime() - r.published_at.getTime()) / DAY_MS)
            : 0,
        })),
      },
      stages,
      active: {
        count: active.count,
        projects: active.rows.map((r): ActiveProjectDto => {
          const startedOn = r.activated_at ? bdDate(r.activated_at) : null;
          const plannedEndOn = startedOn
            ? addMonths(startedOn, r.duration_months)
            : null;
          return {
            project: { id: r.id, name: r.title },
            farmer: { id: r.farmer_id, name: names.get(r.farmer_id) ?? '' },
            produceCode: r.produce_code,
            districtCode: r.district_code,
            startedOn,
            plannedEndOn,
            overdue: plannedEndOn !== null && today > plannedEndOn,
            raised: poishaToTaka(BigInt(r.raised)),
            inputsCommitted: poishaToTaka(BigInt(r.committed)),
            inputsSpent: poishaToTaka(BigInt(r.spent)),
            lastFieldRecordAt: r.last_field_record,
            openClaims: Number(r.open_claims),
            openListings: Number(r.open_listings),
          };
        }),
      },
      queues: queues.map(({ def, count, urgent, rows }): QueueDto => ({
        key: def.key,
        title: def.title,
        actionBy: def.actionBy,
        count,
        ...(urgent && { urgent }),
        oldest: rows.map((r) => ({
          id: r.id.trim(),
          title: r.title,
          detail: r.detail,
          params: itemParams(r.params),
          person: r.person_id
            ? { id: r.person_id, name: names.get(r.person_id) ?? '' }
            : null,
          project: r.project_id
            ? { id: r.project_id, name: r.project_title ?? '' }
            : null,
          since: r.since,
        })),
      })),
      figures: cached.figures,
      trends: cached.trends,
      figuresAsOf: cached.at,
    };
  }

  // --- Live parts ---

  private async funding() {
    const [rows, [totals]] = await Promise.all([
      this.dataSource.query<
        Array<{
          id: string;
          title: string;
          farmer_id: string;
          produce_code: string;
          district_code: string;
          target: string;
          raised: string;
          total_slots: string;
          issued_slots: number;
          reserved_slots: number;
          pending_reservations: string;
          published_at: Date | null;
        }>
      >(
        `SELECT p.id, p.title, p.farmer_id, p.produce_code, p.district_code,
                p.funding_target::text AS target, (p.issued_slots * p.slot_price)::text AS raised,
                (p.funding_target / p.slot_price)::text AS total_slots, p.issued_slots, p.reserved_slots,
                (SELECT COUNT(*) FROM reservations r
                  WHERE r.project_id = p.id AND r.status = 'pending') AS pending_reservations,
                p.published_at
           FROM projects p WHERE p.stage = 'open_for_funding'
          ORDER BY p.published_at, p.id LIMIT ${LIST_LIMIT}`,
      ),
      this.dataSource.query<
        Array<{ n: string; target: string; raised: string }>
      >(
        `SELECT COUNT(*) AS n, COALESCE(SUM(funding_target), 0)::text AS target,
                COALESCE(SUM(issued_slots * slot_price), 0)::text AS raised
           FROM projects WHERE stage = 'open_for_funding'`,
      ),
    ]);
    return {
      rows,
      count: Number(totals.n),
      target: BigInt(totals.target),
      raised: BigInt(totals.raised),
    };
  }

  private async stages(): Promise<Record<string, number>> {
    const rows = await this.dataSource.query<
      Array<{ stage: string; n: string }>
    >(`SELECT stage, COUNT(*) AS n FROM projects GROUP BY stage`);
    return Object.fromEntries(rows.map((r) => [r.stage, Number(r.n)]));
  }

  /** Each column is a correlated subquery on an index, for the 20 listed only. */
  private async active() {
    const [rows, [{ n }]] = await Promise.all([
      this.dataSource.query<
        Array<{
          id: string;
          title: string;
          farmer_id: string;
          produce_code: string;
          district_code: string;
          duration_months: number;
          activated_at: Date | null;
          raised: string;
          committed: string;
          spent: string;
          last_field_record: Date | null;
          open_claims: string;
          open_listings: string;
        }>
      >(
        `SELECT p.id, p.title, p.farmer_id, p.produce_code, p.district_code, p.duration_months,
                p.activated_at, (p.issued_slots * p.slot_price)::text AS raised,
                (SELECT COALESCE(SUM(v.value - COALESCE(v.voided_amount, 0)), 0) FROM vouchers v
                  WHERE v.project_id = p.id AND v.status IN ('active', 'cancelled'))::text AS committed,
                (SELECT COALESCE(SUM(s.amount), 0) FROM voucher_sales s JOIN vouchers v ON v.id = s.voucher_id
                  WHERE v.project_id = p.id AND s.status = 'confirmed')::text AS spent,
                (SELECT MAX(f.observed_at) FROM field_records f
                  WHERE f.project_id = p.id AND f.status = 'recorded') AS last_field_record,
                (SELECT COUNT(*) FROM insurance_claims c
                  WHERE c.project_id = p.id AND c.status IN ('triggered', 'under_review')) AS open_claims,
                (SELECT COUNT(*) FROM listings l
                  WHERE l.project_id = p.id AND l.status = 'open') AS open_listings
           FROM projects p WHERE p.stage = 'active'
          ORDER BY p.activated_at, p.id LIMIT ${LIST_LIMIT}`,
      ),
      this.dataSource.query<Array<{ n: string }>>(
        `SELECT COUNT(*) AS n FROM projects WHERE stage = 'active'`,
      ),
    ]);
    return { rows, count: Number(n) };
  }

  private async queue(def: QueueDef, now: Date) {
    const run = <T>(sql: string) =>
      this.dataSource.query<T[]>(sql, sql.includes('$1') ? [now] : []);
    const urgentKeys = Object.keys(def.urgent ?? {});
    const [[{ n }], rows, ...urgentCounts] = await Promise.all([
      run<{ n: string }>(def.count),
      run<QueueRow>(def.items),
      ...urgentKeys.map((k) => run<{ n: string }>(def.urgent![k])),
    ]);
    return {
      def,
      count: Number(n),
      rows,
      urgent: def.urgent
        ? Object.fromEntries(
            urgentKeys.map((k, i) => [k, Number(urgentCounts[i][0].n)]),
          )
        : undefined,
    };
  }

  // --- Cached figures and trends ---

  private async figures(now: Date): Promise<Cached> {
    if (
      this.cached &&
      now.getTime() - this.cached.at.getTime() < FIGURES_TTL_MS
    )
      return this.cached;
    // One computation shared by every request that arrives meanwhile.
    this.computing ??= this.compute(now).finally(() => {
      this.computing = null;
    });
    return this.computing;
  }

  private async compute(now: Date): Promise<Cached> {
    const months = lastMonths(bdDate(now).slice(0, 7), 12);
    const from = new Date(bdDayStart(`${months[0]}-01`) * 1000);
    const to = new Date(bdDayStart(`${monthAfter(months[11])}-01`) * 1000);
    const month = (col: string) =>
      `to_char(${col} AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM')`;
    const series = (sql: string) =>
      this.dataSource.query<Array<{ m: string; v: string }>>(sql, [from, to]);

    const [[totals], roles, funding, sales, payouts, started, finished] =
      await Promise.all([
        this.dataSource.query<
          Array<
            Record<
              | 'funding'
              | 'refunded'
              | 'sales'
              | 'insurance'
              | 'inputs'
              | 'payouts',
              string
            >
          >
        >(
          `SELECT
             (SELECT COALESCE(SUM(r.slots * p.slot_price), 0) FROM reservations r
                JOIN projects p ON p.id = r.project_id WHERE r.status = 'confirmed')::text AS funding,
             (SELECT COALESCE(SUM(amount), 0) FROM refunds WHERE confirmed)::text AS refunded,
             (SELECT COALESCE(SUM(unit_price * quantity), 0) FROM offers WHERE status = 'delivered')::text AS sales,
             (SELECT COALESCE(SUM(approved_amount), 0) FROM insurance_claims WHERE status = 'paid')::text AS insurance,
             (SELECT COALESCE(SUM(amount), 0) FROM voucher_sales WHERE status = 'confirmed')::text AS inputs,
             (SELECT COALESCE(SUM(amount), 0) FROM payout_lines WHERE paid_at IS NOT NULL)::text AS payouts`,
        ),
        this.dataSource.query<Array<{ role: string; n: string }>>(
          `SELECT role, COUNT(*) AS n FROM users
            WHERE status = 'verified' AND role <> 'super_admin' GROUP BY role`,
        ),
        series(
          `SELECT ${month('r.closed_at')} AS m, SUM(r.slots * p.slot_price)::text AS v
             FROM reservations r JOIN projects p ON p.id = r.project_id
            WHERE r.status = 'confirmed' AND r.closed_at >= $1 AND r.closed_at < $2 GROUP BY 1`,
        ),
        series(
          `SELECT ${month('delivered_at')} AS m, SUM(unit_price * quantity)::text AS v FROM offers
            WHERE status = 'delivered' AND delivered_at >= $1 AND delivered_at < $2 GROUP BY 1`,
        ),
        series(
          `SELECT ${month('paid_at')} AS m, SUM(amount)::text AS v FROM payout_lines
            WHERE paid_at >= $1 AND paid_at < $2 GROUP BY 1`,
        ),
        series(
          `SELECT ${month('activated_at')} AS m, COUNT(*)::text AS v FROM projects
            WHERE activated_at >= $1 AND activated_at < $2 GROUP BY 1`,
        ),
        series(
          `SELECT ${month('finished_at')} AS m, COUNT(*)::text AS v FROM projects
            WHERE finished_at >= $1 AND finished_at < $2 GROUP BY 1`,
        ),
      ]);
    const byMonth = (rows: Array<{ m: string; v: string }>) => {
      const map = new Map(rows.map((r) => [r.m, r.v]));
      return months.map((m) => map.get(m) ?? '0');
    };
    const taka = (rows: Array<{ m: string; v: string }>) =>
      byMonth(rows).map((v) => poishaToTaka(BigInt(v)));
    const count = (rows: Array<{ m: string; v: string }>) =>
      byMonth(rows).map(Number);
    this.cached = {
      at: now,
      figures: {
        fundingRaised: poishaToTaka(BigInt(totals.funding)),
        refunded: poishaToTaka(BigInt(totals.refunded)),
        salesIncome: poishaToTaka(BigInt(totals.sales)),
        insuranceApproved: poishaToTaka(BigInt(totals.insurance)),
        inputsSpent: poishaToTaka(BigInt(totals.inputs)),
        payoutsPaid: poishaToTaka(BigInt(totals.payouts)),
        participants: Object.fromEntries(
          roles.map((r) => [r.role, Number(r.n)]),
        ),
      },
      trends: {
        months,
        fundingRaised: taka(funding),
        salesIncome: taka(sales),
        payoutsPaid: taka(payouts),
        projectsStarted: count(started),
        projectsFinished: count(finished),
      },
    };
    return this.cached;
  }
}

/** part / whole as a percentage with one decimal, rounded down: "42.5". */
export function percent(part: bigint, whole: bigint): string {
  if (whole <= 0n) return '0.0';
  const tenths = (part * 1000n) / whole;
  return `${tenths / 10n}.${tenths % 10n}`;
}

/** The `count` months ending with `last` (YYYY-MM), oldest first. */
export function lastMonths(last: string, count: number): string[] {
  const [y, m] = last.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

/** The month after `month` (YYYY-MM). */
export function monthAfter(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}

/** An item's values as sent: money in taka, everything else as stored. */
function itemParams(
  params: QueueRow['params'],
): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(params ?? {}).map(([k, v]) => [
      k,
      ITEM_MONEY.has(k) && typeof v === 'string' ? poishaToTaka(BigInt(v)) : v,
    ]),
  );
}
