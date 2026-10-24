import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { fingerprint } from '../../blockchain/utils/fingerprint';
import { poishaToTaka } from '../../blockchain/utils/money';
import {
  BD_DISTRICTS,
  isDistrictCode,
} from '../../common/reference/bd-districts';
import { addMonths, bdDate } from '../../common/time/bd-dates';
import { CatalogService } from '../catalog/catalog.service';
import { signedTaka } from '../settlement/settlement-math';
import { MAX_PROJECTS_PER_RECORD } from './track-record.enums';

/**
 * A farmer's track record as published. Every value is a string, boolean,
 * number or null so the stored JSON fingerprints the same after a database
 * round trip. Money is taka; quantities are in the produce's unit.
 */
export interface TrackRecordSummary {
  /** 2 added importedHistory; published v1 records stay valid as stored. */
  v: 1 | 2;
  /** Makes each published version's fingerprint unique. */
  recordId: string;
  generatedAt: string;
  farmer: { id: string; name: string; district: Place | null };
  projects: ProjectOutcome[];
  totals: {
    projects: number;
    finishedOnTime: number;
    fundingRaised: string;
    income: string;
    costs: string;
    net: string;
    farmerReceived: string;
    claimsApproved: number;
    claimsApprovedAmount: string;
  };
  /**
   * Projects WeGro finished before the platform, from its own records: not
   * on the ledger and not in the totals above.
   */
  importedHistory?: ImportedProject[];
}

export interface ImportedProject {
  title: string;
  produce: { code: string; name: string; unit: string };
  district: Place;
  startedOn: string;
  finishedOn: string;
  fundingRaised: string;
  income: string;
  costs: string;
  net: string;
  farmerReceived: string;
  harvested: string | null;
  sold: string | null;
}

interface Place {
  code: string;
  name: string;
}

export interface ProjectOutcome {
  id: string;
  title: string;
  produce: { code: string; name: string; unit: string };
  district: Place;
  durationType: string;
  durationMonths: number;
  /** Became active (crop in the field). */
  startedOn: string | null;
  /** startedOn plus the planned duration. */
  plannedEndOn: string | null;
  /** Paid out (or closed). */
  finishedOn: string | null;
  onTime: boolean | null;
  money: {
    fundingRaised: string;
    income: string;
    sales: string;
    insurance: string;
    costs: string;
    inputs: string;
    otherCosts: string;
    /** Income less costs; below zero is a loss. */
    net: string;
    farmerReceived: string;
    /** What investors got back over what they put in, in percent, two decimals. */
    investorReturnPercent: string | null;
  };
  harvest: { harvested: string | null; sold: string; unit: string };
  risk: {
    claimsApproved: number;
    claimsRejected: number;
    approvedAmount: string;
    events: Array<{ type: string; occurredOn: string; severity: string }>;
  };
}

/** The ledger's summaryHash. */
export const summaryFingerprint = (s: TrackRecordSummary) =>
  fingerprint('consent.track-record', s);

/**
 * Builds a farmer's track record from their finished projects (paid out or
 * closed, newest 50): outcomes, money from the settled rounds, harvest and
 * sales, and insurance claims. One query per kind of fact, for all projects
 * at once.
 */
@Injectable()
export class TrackRecordBuilder {
  constructor(
    private readonly dataSource: DataSource,
    private readonly catalog: CatalogService,
  ) {}

  async build(input: {
    recordId: string;
    farmer: { id: string; name: string; districtCode: string | null };
    now: Date;
  }): Promise<{ summary: TrackRecordSummary; projectIds: string[] }> {
    const q = <T>(sql: string, params: unknown[]) =>
      this.dataSource.query<T[]>(sql, params);
    const finished = await q<{
      id: string;
      title: string;
      produce_code: string;
      district_code: string;
      duration_type: string;
      duration_months: number;
      issued_slots: number;
      slot_price: string;
      activated_at: Date | null;
      finished_at: Date | null;
    }>(
      `SELECT id, title, produce_code, district_code, duration_type, duration_months, issued_slots,
              slot_price::text AS slot_price, activated_at, finished_at
         FROM projects
        WHERE farmer_id = $1 AND stage IN ('paid_out', 'closed')`,
      [input.farmer.id],
    );
    const ids = finished.map((p) => p.id);

    const [rounds, farmerPaid, claims, inputs, harvest, sold] =
      ids.length === 0
        ? [[], [], [], [], [], []]
        : await Promise.all([
            // The final round holds the settled income and costs.
            q<{
              project_id: string;
              income: string;
              costs: string;
              investor_total: string;
            }>(
              `SELECT project_id,
                      MAX(income) FILTER (WHERE is_final)::text AS income,
                      MAX(costs) FILTER (WHERE is_final)::text AS costs,
                      (SUM(investor_share) + SUM(capital_return))::text AS investor_total
                 FROM settlement_rounds
                WHERE project_id = ANY($1) AND status IN ('approved', 'paid')
                GROUP BY project_id`,
              [ids],
            ),
            q<{ project_id: string; amount: string }>(
              `SELECT r.project_id, SUM(l.amount)::text AS amount
                 FROM payout_lines l JOIN settlement_rounds r ON r.id = l.round_id
                WHERE r.project_id = ANY($1) AND l.payee_id = $2 AND l.paid_at IS NOT NULL
                GROUP BY r.project_id`,
              [ids, input.farmer.id],
            ),
            q<{
              project_id: string;
              status: string;
              amount: string | null;
              event_type_code: string;
              occurred_on: string;
              severity: string;
            }>(
              `SELECT c.project_id, c.status, c.approved_amount::text AS amount, e.event_type_code,
                      to_char(e.occurred_on, 'YYYY-MM-DD') AS occurred_on, e.severity
                 FROM insurance_claims c JOIN weather_events e ON e.id = c.event_id
                WHERE c.project_id = ANY($1) AND c.status IN ('approved', 'paid', 'rejected')
                ORDER BY e.occurred_on, c.id`,
              [ids],
            ),
            q<{ project_id: string; amount: string }>(
              `SELECT v.project_id, SUM(s.amount)::text AS amount
                 FROM voucher_sales s JOIN vouchers v ON v.id = s.voucher_id
                WHERE v.project_id = ANY($1) AND s.status = 'confirmed'
                GROUP BY v.project_id`,
              [ids],
            ),
            // Harvest records count unless a later record corrects them.
            q<{ project_id: string; quantity: string }>(
              `SELECT f.project_id, SUM((f.measurements->>'quantity')::numeric)::text AS quantity
                 FROM field_records f
                WHERE f.project_id = ANY($1) AND f.entry_type_code = 'HARVEST' AND f.status = 'recorded'
                  AND NOT EXISTS (SELECT 1 FROM field_records c
                                   WHERE c.corrects_entry_id = f.id AND c.status = 'recorded')
                GROUP BY f.project_id`,
              [ids],
            ),
            q<{ project_id: string; quantity: string }>(
              `SELECT l.project_id, SUM(o.quantity)::text AS quantity
                 FROM offers o JOIN listings l ON l.id = o.listing_id
                WHERE l.project_id = ANY($1) AND o.status = 'delivered'
                GROUP BY l.project_id`,
              [ids],
            ),
          ]);

    const byProject = <T extends { project_id: string }>(rows: T[]) =>
      new Map(rows.map((r) => [r.project_id, r]));
    const roundOf = byProject(rounds);
    const farmerPaidOf = byProject(farmerPaid);
    const inputsOf = byProject(inputs);
    const harvestOf = byProject(harvest);
    const soldOf = byProject(sold);
    const claimsOf = new Map<string, typeof claims>();
    for (const c of claims) {
      const list = claimsOf.get(c.project_id);
      if (list) list.push(c);
      else claimsOf.set(c.project_id, [c]);
    }

    // The newest 50 finished projects, then in the ledger's order.
    const chosen = finished
      .sort(
        (a, b) =>
          (b.finished_at?.getTime() ?? 0) - (a.finished_at?.getTime() ?? 0),
      )
      .slice(0, MAX_PROJECTS_PER_RECORD)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const totals = {
      fundingRaised: 0n,
      income: 0n,
      costs: 0n,
      farmerReceived: 0n,
      claimsApproved: 0,
      claimsApprovedAmount: 0n,
      onTime: 0,
    };
    const projects = chosen.map((p): ProjectOutcome => {
      const capital = BigInt(p.issued_slots) * BigInt(p.slot_price);
      const round = roundOf.get(p.id);
      const income = BigInt(round?.income ?? 0);
      const costs = BigInt(round?.costs ?? 0);
      const inputsSpent = BigInt(inputsOf.get(p.id)?.amount ?? 0);
      const myClaims = claimsOf.get(p.id) ?? [];
      // Approved claims, paid by the insurer or not yet.
      const approved = myClaims.filter((c) => c.status !== 'rejected');
      const insurance = approved.reduce((s, c) => s + BigInt(c.amount!), 0n);
      const farmerReceived = BigInt(farmerPaidOf.get(p.id)?.amount ?? 0);
      const finishedOn = p.finished_at ? bdDate(p.finished_at) : null;
      const startedOn = p.activated_at ? bdDate(p.activated_at) : null;
      const plannedEndOn = startedOn
        ? addMonths(startedOn, p.duration_months)
        : null;
      const onTime =
        finishedOn && plannedEndOn ? finishedOn <= plannedEndOn : null;

      totals.fundingRaised += capital;
      totals.income += income;
      totals.costs += costs;
      totals.farmerReceived += farmerReceived;
      totals.claimsApproved += approved.length;
      totals.claimsApprovedAmount += insurance;
      if (onTime) totals.onTime++;

      const produce = this.catalog.produceTypes.get(p.produce_code);
      const unit = produce
        ? (this.catalog.units.get(produce.unitCode)?.symbol ?? '')
        : '';
      return {
        id: p.id,
        title: p.title,
        produce: {
          code: p.produce_code,
          name: produce?.name ?? p.produce_code,
          unit,
        },
        district: place(p.district_code),
        durationType: p.duration_type,
        durationMonths: p.duration_months,
        startedOn,
        plannedEndOn,
        finishedOn,
        onTime,
        money: {
          fundingRaised: poishaToTaka(capital),
          income: poishaToTaka(income),
          sales: poishaToTaka(income > insurance ? income - insurance : 0n),
          insurance: poishaToTaka(insurance),
          costs: poishaToTaka(costs),
          inputs: poishaToTaka(inputsSpent),
          otherCosts: poishaToTaka(
            costs > inputsSpent ? costs - inputsSpent : 0n,
          ),
          net: signedTaka(income - costs),
          farmerReceived: poishaToTaka(farmerReceived),
          investorReturnPercent:
            round && capital > 0n
              ? percent(BigInt(round.investor_total) - capital, capital)
              : null,
        },
        harvest: {
          harvested: harvestOf.get(p.id)?.quantity ?? null,
          sold: soldOf.get(p.id)?.quantity ?? '0',
          unit,
        },
        risk: {
          claimsApproved: approved.length,
          claimsRejected: myClaims.length - approved.length,
          approvedAmount: poishaToTaka(insurance),
          events: myClaims.map((c) => ({
            type: c.event_type_code,
            occurredOn: c.occurred_on,
            severity: c.severity,
          })),
        },
      };
    });

    const importedHistory = await this.importedHistory(input.farmer.id);

    return {
      summary: {
        v: 2,
        recordId: input.recordId,
        generatedAt: input.now.toISOString(),
        farmer: {
          id: input.farmer.id,
          name: input.farmer.name,
          district: input.farmer.districtCode
            ? place(input.farmer.districtCode)
            : null,
        },
        projects,
        totals: {
          projects: projects.length,
          finishedOnTime: totals.onTime,
          fundingRaised: poishaToTaka(totals.fundingRaised),
          income: poishaToTaka(totals.income),
          costs: poishaToTaka(totals.costs),
          net: signedTaka(totals.income - totals.costs),
          farmerReceived: poishaToTaka(totals.farmerReceived),
          claimsApproved: totals.claimsApproved,
          claimsApprovedAmount: poishaToTaka(totals.claimsApprovedAmount),
        },
        importedHistory,
      },
      projectIds: projects.map((p) => p.id),
    };
  }

  /** Finished projects imported from WeGro's records, newest first. */
  async importedHistory(farmerId: string): Promise<ImportedProject[]> {
    const legacy = await this.dataSource.query<
      {
        title: string;
        produce_code: string;
        district_code: string;
        started_on: string;
        finished_on: string;
        funding_raised: string;
        income: string;
        costs: string;
        farmer_received: string;
        harvested: string | null;
        sold: string | null;
      }[]
    >(
      `SELECT title, produce_code, district_code, to_char(started_on, 'YYYY-MM-DD') AS started_on,
              to_char(finished_on, 'YYYY-MM-DD') AS finished_on, funding_raised::text, income::text,
              costs::text, farmer_received::text, trim_scale(harvested)::text AS harvested,
              trim_scale(sold)::text AS sold
         FROM legacy_projects WHERE farmer_id = $1 ORDER BY finished_on DESC, id`,
      [farmerId],
    );
    return legacy.map((l) => this.imported(l));
  }

  /** An imported project as shown: money in taka, names from the catalog. */
  imported(l: {
    title: string;
    produce_code: string;
    district_code: string;
    started_on: string;
    finished_on: string;
    funding_raised: string;
    income: string;
    costs: string;
    farmer_received: string;
    harvested: string | null;
    sold: string | null;
  }): ImportedProject {
    const produce = this.catalog.produceTypes.get(l.produce_code);
    return {
      title: l.title,
      produce: {
        code: l.produce_code,
        name: produce?.name ?? l.produce_code,
        unit: produce
          ? (this.catalog.units.get(produce.unitCode)?.symbol ?? '')
          : '',
      },
      district: place(l.district_code),
      startedOn: l.started_on,
      finishedOn: l.finished_on,
      fundingRaised: poishaToTaka(BigInt(l.funding_raised)),
      income: poishaToTaka(BigInt(l.income)),
      costs: poishaToTaka(BigInt(l.costs)),
      net: signedTaka(BigInt(l.income) - BigInt(l.costs)),
      farmerReceived: poishaToTaka(BigInt(l.farmer_received)),
      harvested: l.harvested,
      sold: l.sold,
    };
  }
}

function place(code: string): Place {
  return { code, name: isDistrictCode(code) ? BD_DISTRICTS[code].name : code };
}

/** gain / base as a percentage with two decimals, rounded toward zero: "12.35", "-3.10". */
export function percent(gain: bigint, base: bigint): string {
  const hundredths = (gain * 10_000n) / base;
  const abs = hundredths < 0n ? -hundredths : hundredths;
  const sign = hundredths < 0n ? '-' : '';
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}
