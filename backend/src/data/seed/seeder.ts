import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ChainClock } from '../../blockchain/chain-clock';
import { ContractsRegistry } from '../../blockchain/contracts.registry';
import { bdDate } from '../../common/time/bd-dates';
import type { AuthUser } from '../../modules/auth/auth-user';
import { BankAccountsService } from '../../modules/bank-accounts/bank-accounts.service';
import { FieldRecordsService } from '../../modules/field-records/field-records.service';
import { PhotosService } from '../../modules/field-records/photos.service';
import { ClaimsService } from '../../modules/insurance/claims.service';
import { InsuranceService } from '../../modules/insurance/insurance.service';
import { ProjectsService } from '../../modules/projects/projects.service';
import { ReservationsService } from '../../modules/projects/reservations.service';
import { SettlementService } from '../../modules/settlement/settlement.service';
import { BanksService } from '../../modules/track-record/banks.service';
import { TrackRecordsService } from '../../modules/track-record/track-records.service';
import { RequestsService } from '../../modules/trade/requests.service';
import { TradeService } from '../../modules/trade/trade.service';
import { User } from '../../modules/users/entities/user.entity';
import { BatchesService } from '../../modules/vouchers/batches.service';
import { VouchersService } from '../../modules/vouchers/vouchers.service';
import { WarehouseService } from '../../modules/warehouse/warehouse.service';
import { ImportRecord } from '../entities/import-record.entity';
import { Importer } from '../import/importer';
import { buildDataset, type Dataset, type DatasetProject } from './dataset';

/** Sample sizes: how many times the showcase is repeated. */
export const SEED_SIZES = { showcase: 1, large: 5 } as const;

const LOCAL_CHAIN_ID = 31337n;
const DAY_MS = 86_400_000;
const MARKER = { kind: 'seed', externalId: 'sample-data' } as const;

export interface SeedSummary {
  people: number;
  projects: number;
  stories: Record<string, number>;
  skipped: string[];
}

/**
 * Builds the sample world through the real services, so every record is on
 * the ledger exactly as if people had used the app: the dataset (people,
 * projects, investments, history) goes in through the importer, then each
 * project is taken through its story: vouchers and input sales, farm
 * records, insurance claims, storage, marketplace deals, settlement and
 * payouts, a track record a bank views, a buy-back, a cancellation with
 * refunds. Deterministic; refuses to run twice on the same data.
 */
export class Seeder {
  private readonly ds: DataSource;
  private ids = new Map<string, string>();
  private photoCount = 0;
  private refCount = 0;
  /**
   * In every payment reference: the ledger keeps used references for good,
   * so a reseed onto the same contracts must not repeat them.
   */
  private readonly tag = randomBytes(3).toString('hex').toUpperCase();
  private site: string | null = null;
  private bank: string | null = null;

  constructor(
    private readonly app: INestApplicationContext,
    private readonly opts: { scale: number; log: (m: string) => void },
  ) {
    this.ds = app.get(DataSource);
  }

  private get<T>(cls: new (...args: never[]) => T): T {
    return this.app.get(cls, { strict: false });
  }

  async run(): Promise<SeedSummary> {
    const records = this.ds.getRepository(ImportRecord);
    if (await records.existsBy(MARKER)) {
      throw new Error(
        'Sample data is already loaded; reset first (npm run data:reset)',
      );
    }
    const data = buildDataset(this.opts.scale, this.tag);

    // 1. People, projects, investments and history through the importer.
    const folder = mkdtempSync(join(tmpdir(), 'wegro-seed-'));
    try {
      for (const [file, text] of Object.entries(data.files)) {
        writeFileSync(join(folder, file), text);
      }
      const importer = new Importer(this.app, { folder });
      const problems = await importer.validate();
      if (problems.length) {
        throw new Error(
          `Sample data failed validation: ${problems
            .slice(0, 5)
            .map((p) => `${p.file}:${p.line} ${p.message}`)
            .join('; ')}`,
        );
      }
      this.opts.log('Importing people, projects and investments...');
      const { outcomes } = await importer.apply();
      const failed = outcomes.filter((o) => o.result === 'failed');
      if (failed.length) {
        throw new Error(
          `Import failed: ${failed
            .slice(0, 5)
            .map((f) => `${f.id}: ${f.message}`)
            .join('; ')}`,
        );
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
    this.ids = new Map(
      (
        await records.find({ where: [{ kind: 'person' }, { kind: 'project' }] })
      ).map((r) => [r.externalId, r.internalId]),
    );

    // 2. The stories. Time-dependent ones first, open items last, so the
    // time jump of a staged payout does not lapse deals meant to stay open.
    const summary: SeedSummary = {
      people: Object.values(data.people).flat().length,
      projects: data.projects.length,
      stories: {},
      skipped: [],
    };
    const order: Array<DatasetProject['story']> = [
      'inputs-and-claim',
      'stored-and-paid-out',
      'buy-back',
      'staged-payout',
      'cancelled',
      'fresh-deals',
      'open',
    ];
    for (const story of order) {
      for (const p of data.projects.filter((x) => x.story === story)) {
        this.opts.log(`Story ${story}: ${p.id}`);
        const done = await this.story(data, p);
        if (done) summary.stories[story] = (summary.stories[story] ?? 0) + 1;
        else summary.skipped.push(`${p.id} (${story})`);
      }
    }
    await this.buyerRequest(data);
    await records.insert({
      ...MARKER,
      internalId: String(data.projects.length),
    });
    return summary;
  }

  // --- Stories -------------------------------------------------------------------

  private async story(data: Dataset, p: DatasetProject): Promise<boolean> {
    const project = this.id(p.id);
    const officer = await this.as(data.officerOf.get(p.farmerId)!);
    switch (p.story) {
      case 'inputs-and-claim':
        await this.inputs(data, project, officer);
        await this.farmRecords(project, officer);
        await this.claim(data, p, project, officer);
        return true;
      case 'stored-and-paid-out': {
        await this.storeAndSell(data, project, officer, 3000, '31');
        await this.finalPayout(data, p, project);
        await this.trackRecord(data, p, officer);
        return true;
      }
      case 'buy-back': {
        const receipt = await this.receipt(data, project, 2000);
        await this.get(WarehouseService).offerHandover(officer, receipt);
        await this.get(WarehouseService).acceptHandover(
          await this.admin(data),
          receipt,
        );
        return true;
      }
      case 'staged-payout': {
        await this.storeAndSell(data, project, officer, 1500, '28');
        const chainId = (
          await this.get(ContractsRegistry).provider.getNetwork()
        ).chainId;
        if (chainId !== LOCAL_CHAIN_ID) return false; // needs a 90-day time jump
        await this.travel(90 * DAY_MS + 60_000);
        const round = await this.get(SettlementService).prepareRound(
          await this.accounts(data, 0),
          project,
          false,
        );
        await this.approveAndPay(data, round.id, round.lines);
        return true;
      }
      case 'cancelled': {
        const admin = await this.admin(data);
        await this.get(ProjectsService).advance(
          admin,
          project,
          'cancelProject',
        );
        const holders: Array<{ investor_id: string }> = await this.ds.query(
          `SELECT DISTINCT investor_id FROM reservations WHERE project_id = $1 AND status = 'confirmed'`,
          [project],
        );
        for (const h of holders) {
          await this.get(ReservationsService).recordRefund(
            await this.accounts(data, 0),
            project,
            h.investor_id,
            this.ref('REFUND'),
          );
        }
        return true;
      }
      case 'fresh-deals': {
        const trade = this.get(TradeService);
        const listing = await trade.listProduce(officer, {
          projectId: project,
          quantity: 1000,
          askingUnitPrice: '42',
        });
        const [b1, b2] = data.people.buyer;
        const deal = await trade.makeOffer(await this.as(b1), listing.id, {
          quantity: 300,
          unitPrice: '40',
        });
        await trade.approveOffer(await this.admin(data), deal.id); // awaits the buyer's payment
        await trade.makeOffer(await this.as(b2), listing.id, {
          quantity: 200,
          unitPrice: '41',
        }); // awaits approval
        return true;
      }
      case 'open': {
        // One more investor holds a slot but has not paid yet.
        const investors = data.people.investor;
        const investor = await this.as(investors[investors.length - 1]);
        await this.get(ReservationsService).reserve(investor, project, 1);
        return true;
      }
      default:
        return true;
    }
  }

  /** A voucher proposed and approved, a supplier batch, a sale the officer confirms. */
  private async inputs(data: Dataset, project: string, officer: AuthUser) {
    const vouchers = this.get(VouchersService);
    const [s1, s2] = data.people.supplier;
    const supplier = await this.as(s1);
    const voucher = await vouchers.propose(
      await this.as(data.people.operations[0]),
      project,
      {
        inputTypeCode: 'SEED_MAIZE',
        quantity: 100,
        unitPrice: '50',
        supplierIds: [this.id(s1), this.id(s2)],
      },
    );
    await vouchers.approve(await this.accounts(data, 0), voucher.id);
    const today = await this.today();
    const batch = await this.get(BatchesService).register(supplier, {
      inputTypeCode: 'SEED_MAIZE',
      lotNumber: `SEED-LOT-${voucher.id.slice(0, 8)}`,
      quantity: 1000,
      manufacturer: 'Sample Seeds Ltd',
      producedOn: this.day(today, -30),
      expiresOn: this.day(today, 365),
    });
    const sale = await vouchers.recordSale(supplier, voucher.id, {
      quantity: 60,
      batchIds: [batch.id],
    });
    await vouchers.confirmSale(officer, sale.id);
  }

  private async farmRecords(project: string, officer: AuthUser) {
    const observed = new Date(
      (await this.get(ChainClock).now()).getTime() - 3_600_000,
    ).toISOString();
    const at = {
      latitude: '24.846512',
      longitude: '89.377621',
      accuracyMeters: 8,
      observedAt: observed,
    };
    await this.get(FieldRecordsService).sync(officer, [
      {
        id: randomUUID(),
        projectId: project,
        entryTypeCode: 'LAND_PREPARATION',
        notes: 'Ploughed and levelled',
        ...at,
      },
      {
        id: randomUUID(),
        projectId: project,
        entryTypeCode: 'HARVEST',
        notes: 'First picking',
        measurements: { quantity: 2950 },
        photoId: await this.photo(officer, 'harvest'),
        ...at,
      },
    ] as never);
  }

  private async claim(
    data: Dataset,
    p: DatasetProject,
    project: string,
    officer: AuthUser,
  ) {
    const insurance = this.get(InsuranceService);
    const claims = this.get(ClaimsService);
    const insurer = await this.as(data.people.insurer[0]);
    await insurance.setCoverage(insurer, project, {
      maxAmount: '20000',
      coveredEventTypes: ['FLOOD', 'CYCLONE'],
      notes: 'Crop loss from flood or cyclone',
    });
    const event = await insurance.recordWeatherEvent(await this.admin(data), {
      districtCode: p.districtCode,
      eventTypeCode: 'FLOOD',
      occurredOn: this.day(await this.today(), -1),
      severity: 'severe',
      notes: 'River above danger level for three days',
    } as never);
    const claim = await claims.open(officer, project, {
      eventId: event.id,
      damagePercent: '30',
      notes: 'A third of the field under water',
      photoIds: [await this.photo(officer, 'flood')],
    });
    await claims.startReview(insurer, claim.id);
    await claims.approve(insurer, claim.id, {
      amount: '8000',
      damagePercent: '25',
      notes: 'Confirmed on site',
    });
  }

  /** Stored, listed by the officer, bought, paid and delivered. */
  private async storeAndSell(
    data: Dataset,
    project: string,
    officer: AuthUser,
    quantity: number,
    price: string,
  ) {
    const trade = this.get(TradeService);
    const receipt = await this.receipt(data, project, quantity);
    const listing = await trade.listReceipt(officer, {
      receiptId: receipt,
      askingUnitPrice: String(Number(price) + 1),
    });
    const buyer = await this.as(data.people.buyer[0]);
    const offer = await trade.makeOffer(buyer, listing.id, {
      quantity,
      unitPrice: price,
    });
    await trade.approveOffer(await this.admin(data), offer.id);
    await trade.confirmPayment(
      await this.accounts(data, 0),
      offer.id,
      this.ref('SALE'),
    );
    await trade.confirmDelivery(buyer, offer.id, { quantity });
    await trade.confirmDelivery(
      await this.as(data.people.warehouse[0]),
      offer.id,
      { quantity },
    );
  }

  private async finalPayout(data: Dataset, p: DatasetProject, project: string) {
    const settlement = this.get(SettlementService);
    await settlement.addCost(await this.accounts(data, 0), project, {
      category: 'transport',
      amount: '1500',
      incurredOn: await this.today(),
      note: 'Truck hire, field to warehouse',
    } as never);
    await this.get(ProjectsService).advance(
      await this.admin(data),
      project,
      'markReadyForSale',
    );
    const round = await settlement.prepareRound(
      await this.accounts(data, 0),
      project,
      true,
    );
    // Payees give their bank details; an admin verifies them.
    const bank = this.get(BankAccountsService);
    const { verified } = await bank.forPayout(
      round.lines.map((l) => l.payee.id),
    );
    for (const line of round.lines) {
      if (verified.has(line.payee.id)) continue;
      const payee = await this.actor(line.payee.id);
      await bank.submit(payee, payee.id, {
        holderName: line.payee.name || 'Account holder',
        bankName: 'Sonali Bank PLC',
        branchName: `${p.districtCode.charAt(0)}${p.districtCode.slice(1).toLowerCase()} Branch`,
        // 13 digits derived from the payee's id: stable and distinct.
        accountNumber: BigInt(`0x${payee.id.replace(/-/g, '').slice(0, 12)}`)
          .toString()
          .padStart(13, '0')
          .slice(-13),
        routingNumber: '200100123',
      });
      await bank.verify(await this.admin(data), payee.id);
    }
    await this.approveAndPay(data, round.id, round.lines);
  }

  private async approveAndPay(
    data: Dataset,
    roundId: number,
    lines: Array<{ payee: { id: string } }>,
  ) {
    const settlement = this.get(SettlementService);
    await settlement.approveRound(await this.accounts(data, 1), roundId);
    for (const line of lines) {
      await settlement.recordPayment(await this.accounts(data, 0), roundId, {
        payeeId: line.payee.id,
        paymentReference: this.ref('PAYOUT'),
      });
    }
  }

  /** Published by the officer; a bank gets the farmer's permission and looks. */
  private async trackRecord(
    data: Dataset,
    p: DatasetProject,
    officer: AuthUser,
  ) {
    const records = this.get(TrackRecordsService);
    const farmerId = this.id(p.farmerId);
    await records.publish(officer, farmerId);
    const banks = this.get(BanksService);
    const admin = await this.admin(data);
    const bankOfficer = await this.as(data.people.bank[0]);
    if (!this.bank) {
      this.bank = (
        await banks.register(admin, {
          name: 'Sample Krishi Bank',
          branchName: 'Bogura Branch',
          districtCode: 'BOGURA',
          address: 'Satmatha, Bogura',
        })
      ).id;
      await banks.assignOfficer(admin, bankOfficer.id, this.bank);
    }
    await records.grant(officer, farmerId, {
      bankId: this.bank,
      expiresOn: this.day(await this.today(), 180),
      evidencePhotoId: await this.photo(officer, 'consent-form'),
    });
    await records.bankView(bankOfficer, farmerId);
  }

  private async buyerRequest(data: Dataset) {
    const buyer = await this.as(data.people.buyer[2]);
    await this.get(RequestsService).post(buyer, {
      produceCode: 'TOMATO',
      quantity: 500,
      maxUnitPrice: '45',
      validUntil: this.day(await this.today(), 30),
    });
  }

  // --- Helpers -------------------------------------------------------------------

  /** A receipt at the sample warehouse (created on first use). */
  private async receipt(
    data: Dataset,
    project: string,
    quantity: number,
  ): Promise<string> {
    const warehouse = this.get(WarehouseService);
    const operator = await this.as(data.people.warehouse[0]);
    if (!this.site) {
      const admin = await this.admin(data);
      this.site = (
        await warehouse.createSite(admin, {
          name: 'Sample Hub',
          districtCode: 'BOGURA',
          address: 'Hub road, Bogura',
          storageType: 'warehouse',
        } as never)
      ).id;
      await warehouse.assignOperator(admin, operator.id, this.site);
    }
    const today = await this.today();
    const receipt = await warehouse.issue(operator, {
      projectId: project,
      quantity,
      intakeDate: today,
      expiresOn: this.day(today, 180),
      bagCount: Math.ceil(quantity / 50),
      moisturePercent: '13.5',
    } as never);
    return receipt.id;
  }

  /** A tiny JPEG (structure only), unique per call, uploaded by `by`. */
  private async photo(by: AuthUser, label: string): Promise<string> {
    const data = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x07]),
      Buffer.from('JFIF\0', 'latin1'),
      Buffer.from([0xff, 0xda, 0x00, 0x04, 0x01, 0x02]),
      Buffer.from(`sample-${label}-${++this.photoCount}`, 'latin1'),
      Buffer.from([0xff, 0xd9]),
    ]);
    return (await this.get(PhotosService).store(data, by.id)).id;
  }

  private ref(kind: string): string {
    return `SEED-${kind}-${this.tag}-${String(++this.refCount).padStart(5, '0')}`;
  }

  private id(external: string): string {
    const id = this.ids.get(external);
    if (!id) throw new Error(`${external} was not imported`);
    return id;
  }

  private async as(external: string): Promise<AuthUser> {
    return this.actor(this.id(external));
  }

  private async actor(userId: string): Promise<AuthUser> {
    const u = await this.ds.getRepository(User).findOneByOrFail({ id: userId });
    return {
      id: u.id,
      role: u.role,
      status: u.status,
      chainState: u.chainState,
      keyIndex: u.keyIndex,
      mustChangePassword: false,
    };
  }

  private admin(data: Dataset) {
    return this.as(data.people.admin[0]);
  }

  private accounts(data: Dataset, n: 0 | 1) {
    return this.as(data.people.accounts[n]);
  }

  private async today(): Promise<string> {
    return bdDate(await this.get(ChainClock).now());
  }

  private day(from: string, offset: number): string {
    return new Date(Date.parse(`${from}T00:00:00Z`) + offset * DAY_MS)
      .toISOString()
      .slice(0, 10);
  }

  /** Moves the local chain's clock forward (Hardhat only). */
  private async travel(ms: number) {
    const provider = this.get(ContractsRegistry).provider;
    await provider.send('evm_increaseTime', [Math.floor(ms / 1000)]);
    await provider.send('evm_mine', []);
    await new Promise((r) => setTimeout(r, 1100)); // the chain clock caches for a second
  }
}
