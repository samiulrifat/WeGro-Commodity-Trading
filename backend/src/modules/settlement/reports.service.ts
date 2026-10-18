import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ContractsRegistry } from '../../blockchain/contracts.registry';
import { uuidToBytes32 } from '../../blockchain/utils/ids';
import { poishaToTaka } from '../../blockchain/utils/money';
import { IdentityCryptoService } from '../../common/crypto/identity-crypto.service';
import { type CsvCell, toCsv } from '../../common/csv';
import { bdDayEnd, bdDayStart } from '../../common/time/bd-dates';
import { BankAccountsService } from '../bank-accounts/bank-accounts.service';
import { Project } from '../projects/entities/project.entity';
import { PersonalDetails } from '../users/entities/personal-details.entity';
import { User } from '../users/entities/user.entity';
import { PersonalDetailsCodec } from '../users/personal-details.codec';
import { Role } from '../users/roles';
import type {
  StatementDto,
  StatementProjectDto,
  StatementQueryDto,
} from './dto/settlement.dto';
import { PayoutLine } from './entities/payout-line.entity';
import { SettlementRound } from './entities/settlement-round.entity';
import { signedTaka } from './settlement-math';
import { PayeeRole, RoundStatus } from './settlement.enums';
import { lineContext } from './settlement.service';
import { ErrorCode } from '../../common/errors/error-code';

const STATEMENT_NOTE =
  'Figures come from the ledger. Each payout can be checked against SettlementLedger.payoutLineHash(roundId, payeeId). Returns are never guaranteed.';
const MAX_PERIOD_DAYS = 366;

/**
 * Settlement reports: the payout sheet Accounts pays from, a project's
 * income, costs and rounds, all rounds in a period, and each payee's
 * statement. Each is built from a fixed number of queries, whatever its size.
 */
@Injectable()
export class SettlementReportsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(SettlementRound)
    private readonly rounds: Repository<SettlementRound>,
    @InjectRepository(PayoutLine)
    private readonly lines: Repository<PayoutLine>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(PersonalDetails)
    private readonly details: Repository<PersonalDetails>,
    private readonly codec: PersonalDetailsCodec,
    private readonly crypto: IdentityCryptoService,
    private readonly bank: BankAccountsService,
    private readonly contracts: ContractsRegistry,
  ) {}

  /**
   * Every line of a round with who to pay and where: name, phone and the
   * verified bank account, flagged when it is missing or a change waits.
   */
  async payoutSheet(roundId: number): Promise<{ name: string; csv: string }> {
    const round = await this.rounds.findOneBy({ id: roundId });
    if (!round || round.status === null)
      throw new NotFoundException({
        message: 'Round not found',
        code: ErrorCode.ROUND_NOT_FOUND,
      });
    const [project, lines] = await Promise.all([
      this.projects.findOne({
        where: { id: round.projectId },
        select: { id: true, title: true },
      }),
      this.lines.find({
        where: { roundId },
        order: { payeeRole: 'ASC', payeeId: 'ASC' },
      }),
    ]);
    const ids = lines.map((l) => l.payeeId);
    const [people, bank] = await Promise.all([
      this.people(ids),
      this.bank.forPayout(ids),
    ]);
    const rows = lines.map((l): CsvCell[] => {
      const person = people.get(l.payeeId);
      const account = bank.verified.get(l.payeeId);
      const bankStatus = !account
        ? bank.pendingChange.has(l.payeeId)
          ? 'missing (details waiting for verification)'
          : 'missing'
        : bank.pendingChange.has(l.payeeId)
          ? 'verified (a change is waiting for verification)'
          : 'verified';
      return [
        round.id,
        project?.title ?? '',
        l.payeeId,
        person?.name ?? '',
        person?.phone ?? '',
        l.payeeRole,
        l.slots,
        l.amount === null ? null : poishaToTaka(l.amount),
        l.verified,
        bankStatus,
        account?.holderName,
        account?.bankName,
        account?.branchName,
        account?.accountNumber,
        account?.routingNumber,
        l.paidAt !== null,
        l.paidAt,
        l.paidAt && l.paymentRefEnc
          ? this.crypto.decrypt(
              l.paymentRefEnc,
              lineContext(roundId, l.payeeId),
            )
          : null,
      ];
    });
    return {
      name: `payout-round-${roundId}`,
      csv: toCsv(
        [
          'round_id',
          'project',
          'payee_id',
          'payee_name',
          'phone',
          'role',
          'slots',
          'amount_taka',
          'amount_checked_against_ledger',
          'bank_details',
          'account_holder',
          'bank',
          'branch',
          'account_number',
          'routing_number',
          'paid',
          'paid_at',
          'payment_reference',
        ],
        rows,
      ),
    };
  }

  /**
   * A project's settlement: every income and cost item, the ledger's totals
   * to check them against, and every round.
   */
  async projectReport(
    projectId: string,
  ): Promise<{ name: string; csv: string }> {
    const project = await this.projects.findOneBy({ id: projectId });
    if (!project)
      throw new NotFoundException({
        message: 'Project not found',
        code: ErrorCode.PROJECT_NOT_FOUND,
      });
    const key = uuidToBytes32(projectId);
    const c = this.contracts;
    const [sales, claims, inputs, costs, rounds, ledger] = await Promise.all([
      this.dataSource.query<
        Array<{
          id: string;
          at: Date;
          quantity: string;
          amount: string;
          produce_code: string;
        }>
      >(
        `SELECT o.id, o.delivered_at AS at, o.quantity, (o.unit_price * o.quantity)::text AS amount, l.produce_code
           FROM offers o JOIN listings l ON l.id = o.listing_id
          WHERE l.project_id = $1 AND o.status = 'delivered'
          ORDER BY o.delivered_at, o.id`,
        [projectId],
      ),
      this.dataSource.query<Array<{ id: string; at: Date; amount: string }>>(
        `SELECT id, decided_at AS at, approved_amount::text AS amount
           FROM insurance_claims
          WHERE project_id = $1 AND status = 'approved'
          ORDER BY decided_at, id`,
        [projectId],
      ),
      this.dataSource.query<
        Array<{
          id: string;
          at: Date;
          input_type_code: string;
          quantity: string;
          amount: string;
        }>
      >(
        `SELECT s.id, s.closed_at AS at, v.input_type_code, s.quantity, s.amount::text AS amount
           FROM voucher_sales s JOIN vouchers v ON v.id = s.voucher_id
          WHERE v.project_id = $1 AND s.status = 'confirmed'
          ORDER BY s.closed_at, s.id`,
        [projectId],
      ),
      this.dataSource.query<
        Array<{
          cost_id: string;
          incurred_on: string;
          category: string;
          note: string;
          amount: string;
        }>
      >(
        `SELECT cost_id, to_char(incurred_on, 'YYYY-MM-DD') AS incurred_on, category, note, amount::text AS amount
           FROM project_costs
          WHERE project_id = $1 AND status = 'recorded'
          ORDER BY incurred_on, cost_id`,
        [projectId],
      ),
      this.rounds.find({
        where: { projectId, status: In(Object.values(RoundStatus)) },
        order: { id: 'ASC' },
      }),
      Promise.all([
        c.get('SettlementLedger').currentTotals(key),
        c.get('SettlementLedger').distributedProfit(key),
      ]),
    ]);

    const rows: CsvCell[][] = [];
    let income = 0n;
    let spent = 0n;
    for (const s of sales) {
      income += BigInt(s.amount);
      rows.push([
        'income',
        s.at,
        `Sale of ${s.quantity} ${s.produce_code}`,
        `offer ${s.id}`,
        taka(s.amount),
      ]);
    }
    for (const cl of claims) {
      income += BigInt(cl.amount);
      rows.push([
        'income',
        cl.at,
        'Insurance claim approved',
        `claim ${cl.id}`,
        taka(cl.amount),
      ]);
    }
    for (const s of inputs) {
      spent += BigInt(s.amount);
      rows.push([
        'cost',
        s.at,
        `Inputs: ${s.quantity} ${s.input_type_code}`,
        `voucher sale ${s.id}`,
        taka(s.amount),
      ]);
    }
    for (const k of costs) {
      spent += BigInt(k.amount);
      rows.push([
        'cost',
        k.incurred_on,
        `${k.category}: ${k.note}`,
        `cost ${k.cost_id}`,
        taka(k.amount),
      ]);
    }
    const [[ledgerIncome, ledgerCosts], distributed] = ledger;
    rows.push(
      ['total', null, 'Income (items above)', null, poishaToTaka(income)],
      ['total', null, 'Income (ledger)', null, poishaToTaka(ledgerIncome)],
      ['total', null, 'Costs (items above)', null, poishaToTaka(spent)],
      ['total', null, 'Costs (ledger)', null, poishaToTaka(ledgerCosts)],
      [
        'total',
        null,
        'Net (ledger)',
        null,
        signedTaka(ledgerIncome - ledgerCosts),
      ],
      [
        'total',
        null,
        'Profit split so far (ledger)',
        null,
        poishaToTaka(distributed),
      ],
    );
    for (const r of rounds) {
      const label = `Round ${r.id} (${r.isFinal ? 'final' : 'staged'}, ${r.status})`;
      const ref = `round ${r.id}`;
      const at = r.approvedAt ?? r.preparedAt;
      rows.push(
        ['round', at, `${label}: profit split`, ref, poishaToTaka(r.profit)],
        [
          'round',
          at,
          `${label}: farmer share`,
          ref,
          poishaToTaka(r.farmerShare),
        ],
        [
          'round',
          at,
          `${label}: investor share`,
          ref,
          poishaToTaka(r.investorShare),
        ],
        ['round', at, `${label}: WeGro share`, ref, poishaToTaka(r.wegroShare)],
        [
          'round',
          at,
          `${label}: capital returned`,
          ref,
          poishaToTaka(r.capitalReturn),
        ],
        [
          'round',
          at,
          `${label}: rounding kept by WeGro`,
          ref,
          poishaToTaka(r.leftover),
        ],
      );
    }
    return {
      name: `settlement-${project.title}`,
      csv: toCsv(['section', 'date', 'item', 'reference', 'amount_taka'], rows),
    };
  }

  /** Every round approved within a period (Bangladesh days, inclusive), for the books. */
  async periodReport(
    from: string,
    to: string,
  ): Promise<{ name: string; csv: string }> {
    const start = bdDayStart(from);
    const end = bdDayEnd(to);
    if (end <= start)
      throw new UnprocessableEntityException({
        message: 'to must not be before from',
        code: ErrorCode.PERIOD_REVERSED,
      });
    if (end - start > MAX_PERIOD_DAYS * 86_400) {
      throw new UnprocessableEntityException({
        message: `A period is at most ${MAX_PERIOD_DAYS} days`,
        code: ErrorCode.PERIOD_TOO_LONG,
        details: { maxDays: MAX_PERIOD_DAYS },
      });
    }
    const rounds = await this.rounds
      .createQueryBuilder('r')
      .where('r.status IN (:...st)', {
        st: [RoundStatus.APPROVED, RoundStatus.PAID],
      })
      .andWhere('r.approved_at >= :start AND r.approved_at < :end', {
        start: new Date(start * 1000),
        end: new Date(end * 1000),
      })
      .orderBy('r.approved_at', 'ASC')
      .addOrderBy('r.id', 'ASC')
      .getMany();
    const projects = rounds.length
      ? await this.projects.find({
          where: { id: In([...new Set(rounds.map((r) => r.projectId))]) },
          select: { id: true, title: true },
        })
      : [];
    const titles = new Map(projects.map((p) => [p.id, p.title]));
    return {
      name: `settlement-${from}-to-${to}`,
      csv: toCsv(
        [
          'round_id',
          'project',
          'final',
          'status',
          'approved_at',
          'paid_at',
          'income_taka',
          'costs_taka',
          'profit_taka',
          'farmer_share_taka',
          'investor_share_taka',
          'wegro_share_taka',
          'capital_return_taka',
          'rounding_kept_taka',
          'payees',
          'paid',
          'checked_against_ledger',
          'fingerprint',
        ],
        rounds.map((r) => [
          r.id,
          titles.get(r.projectId) ?? '',
          r.isFinal,
          r.status,
          r.approvedAt,
          r.paidAt,
          poishaToTaka(r.income),
          poishaToTaka(r.costs),
          poishaToTaka(r.profit),
          poishaToTaka(r.farmerShare),
          poishaToTaka(r.investorShare),
          poishaToTaka(r.wegroShare),
          poishaToTaka(r.capitalReturn),
          poishaToTaka(r.leftover),
          r.payeeCount,
          r.paidCount,
          r.verified,
          r.fingerprint,
        ]),
      ),
    };
  }

  /**
   * A payee's statement: each project they invested in or farm, what was
   * invested, every approved payout and whether it is paid, and refunds.
   */
  async statement(
    payeeId: string,
    q: StatementQueryDto,
  ): Promise<StatementDto> {
    const user = await this.users.findOne({
      where: { id: payeeId },
      select: { id: true, role: true },
    });
    if (!user || (user.role !== Role.INVESTOR && user.role !== Role.FARMER)) {
      throw new NotFoundException({
        message: 'No statement for this participant',
        code: ErrorCode.NO_STATEMENT,
      });
    }
    const start = q.from ? new Date(bdDayStart(q.from) * 1000) : null;
    const end = q.to ? new Date(bdDayEnd(q.to) * 1000) : null;
    if (start && end && end <= start)
      throw new UnprocessableEntityException({
        message: 'to must not be before from',
        code: ErrorCode.PERIOD_REVERSED,
      });
    const investor = user.role === Role.INVESTOR;

    const [payouts, stakes, people] = await Promise.all([
      this.dataSource.query<
        Array<{
          round_id: string;
          project_id: string;
          is_final: boolean;
          approved_at: Date;
          amount: string;
          paid_at: Date | null;
          line_hash: string;
          verified: boolean;
        }>
      >(
        `SELECT l.round_id, r.project_id, r.is_final, r.approved_at, l.amount::text AS amount,
                l.paid_at, l.line_hash, l.verified
           FROM payout_lines l JOIN settlement_rounds r ON r.id = l.round_id
          WHERE l.payee_id = $1 AND r.status IN ('approved', 'paid') AND l.amount IS NOT NULL
            AND ($2::timestamptz IS NULL OR r.approved_at >= $2)
            AND ($3::timestamptz IS NULL OR r.approved_at < $3)
          ORDER BY r.approved_at, l.round_id`,
        [payeeId, start, end],
      ),
      // What they put in (investors) or farm (farmers), with any refund.
      investor
        ? this.dataSource.query<
            Array<{
              project_id: string;
              slots: string;
              refunded: string | null;
            }>
          >(
            `SELECT h.project_id, h.slots, f.amount::text AS refunded
               FROM (SELECT project_id, SUM(slots) AS slots FROM reservations
                      WHERE investor_id = $1 AND status = 'confirmed' GROUP BY project_id) h
               LEFT JOIN refunds f ON f.project_id = h.project_id AND f.investor_id = $1 AND f.confirmed`,
            [payeeId],
          )
        : this.dataSource.query<
            Array<{ project_id: string; slots: null; refunded: null }>
          >(
            `SELECT id AS project_id, NULL AS slots, NULL AS refunded FROM projects
              WHERE farmer_id = $1 AND chain_state <> 'local'`,
            [payeeId],
          ),
      this.people([payeeId]),
    ]);

    const projectIds = [
      ...new Set([
        ...stakes.map((s) => s.project_id),
        ...payouts.map((p) => p.project_id),
      ]),
    ];
    const projects = projectIds.length
      ? await this.projects.find({
          where: { id: In(projectIds) },
          select: { id: true, title: true, stage: true, slotPrice: true },
        })
      : [];
    const stakeOf = new Map(stakes.map((s) => [s.project_id, s]));
    const payoutsOf = new Map<string, typeof payouts>();
    for (const x of payouts) {
      const list = payoutsOf.get(x.project_id);
      if (list) list.push(x);
      else payoutsOf.set(x.project_id, [x]);
    }
    const totals = { invested: 0n, received: 0n, due: 0n, refunded: 0n };
    const items = projects
      .map((p): { order: number; dto: StatementProjectDto } => {
        const stake = stakeOf.get(p.id);
        const slots = stake?.slots ? Number(stake.slots) : null;
        const invested = slots === null ? null : p.slotPrice * BigInt(slots);
        const refunded = stake?.refunded ? BigInt(stake.refunded) : 0n;
        const mine = payoutsOf.get(p.id) ?? [];
        let received = 0n;
        let due = 0n;
        for (const x of mine) {
          if (x.paid_at) received += BigInt(x.amount);
          else due += BigInt(x.amount);
        }
        totals.invested += invested ?? 0n;
        totals.received += received;
        totals.due += due;
        totals.refunded += refunded;
        const dto: StatementProjectDto = {
          project: { id: p.id, name: p.title },
          stage: p.stage,
          role: investor ? PayeeRole.INVESTOR : PayeeRole.FARMER,
          slots,
          invested: invested === null ? null : poishaToTaka(invested),
          payouts: mine.map((x) => ({
            roundId: Number(x.round_id),
            isFinal: x.is_final,
            approvedAt: x.approved_at,
            amount: taka(x.amount),
            paid: x.paid_at !== null,
            paidAt: x.paid_at,
            lineHash: x.line_hash.trim(),
            verified: x.verified,
          })),
          received: poishaToTaka(received),
          due: poishaToTaka(due),
          refunded: poishaToTaka(refunded),
        };
        // Projects in the order of their first payout; those without, by name.
        const order = mine[0]?.approved_at.getTime() ?? Number.MAX_SAFE_INTEGER;
        return { order, dto };
      })
      .sort(
        (a, b) =>
          a.order - b.order ||
          a.dto.project.name.localeCompare(b.dto.project.name),
      )
      .map((x) => x.dto);

    return {
      payee: { id: payeeId, name: people.get(payeeId)?.name ?? '' },
      from: q.from ?? null,
      to: q.to ?? null,
      projects: items,
      totals: {
        invested: poishaToTaka(totals.invested),
        received: poishaToTaka(totals.received),
        due: poishaToTaka(totals.due),
        refunded: poishaToTaka(totals.refunded),
      },
      note: STATEMENT_NOTE,
    };
  }

  /** The statement as one row per payout, plus a row per project without one. */
  async statementCsv(
    payeeId: string,
    q: StatementQueryDto,
  ): Promise<{ name: string; csv: string }> {
    const s = await this.statement(payeeId, q);
    const rows: CsvCell[][] = [];
    for (const p of s.projects) {
      const base = [
        p.project.name,
        p.stage,
        p.role,
        p.slots,
        p.invested,
        p.refunded,
      ];
      if (p.payouts.length === 0)
        rows.push([...base, null, null, null, null, null, null, null]);
      for (const x of p.payouts) {
        rows.push([
          ...base,
          x.roundId,
          x.isFinal ? 'final' : 'staged',
          x.approvedAt,
          x.amount,
          x.paid,
          x.paidAt,
          x.lineHash,
        ]);
      }
    }
    rows.push(
      [
        'TOTAL',
        null,
        null,
        null,
        s.totals.invested,
        s.totals.refunded,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
      [
        'TOTAL received',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        s.totals.received,
        null,
        null,
        null,
      ],
      [
        'TOTAL due',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        s.totals.due,
        null,
        null,
        null,
      ],
    );
    return {
      name: `statement-${s.payee.name}-${q.from ?? 'start'}-to-${q.to ?? 'now'}`,
      csv: toCsv(
        [
          'project',
          'stage',
          'role',
          'slots',
          'invested_taka',
          'refunded_taka',
          'round_id',
          'round',
          'approved_at',
          'amount_taka',
          'paid',
          'paid_at',
          'line_hash',
        ],
        rows,
      ),
    };
  }

  /** Names and phones of many people in one query. */
  private async people(
    ids: string[],
  ): Promise<Map<string, { name: string; phone: string }>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.details.find({
      where: { userId: In(unique) },
      select: { userId: true, fullNameEnc: true, phoneEnc: true },
    });
    return new Map(
      rows.map((r) => [
        r.userId,
        { name: this.codec.openName(r), phone: this.codec.openPhone(r) },
      ]),
    );
  }
}

const taka = (poisha: string) => poishaToTaka(BigInt(poisha));
