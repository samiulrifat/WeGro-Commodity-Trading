import {
  AccessRegistry__factory,
  ConsentRegistry__factory,
  InsuranceRegistry__factory,
  ProjectLedger__factory,
  SettlementLedger__factory,
  TradeLedger__factory,
  VoucherRegistry__factory,
  WarehouseReceipt__factory,
} from '../../blockchain/generated';
import type { ChainEvent } from '../../blockchain/indexer/chain-event.entity';
import { uuidToBytes32 } from '../../blockchain/utils/ids';
import { NotificationRules, RULES } from './notification-rules';
import type { NotificationWriter } from './notification-writer';

const ABIS: Record<string, readonly { type: string; name?: string }[]> = {
  AccessRegistry: AccessRegistry__factory.abi,
  ProjectLedger: ProjectLedger__factory.abi,
  VoucherRegistry: VoucherRegistry__factory.abi,
  WarehouseReceipt: WarehouseReceipt__factory.abi,
  TradeLedger: TradeLedger__factory.abi,
  InsuranceRegistry: InsuranceRegistry__factory.abi,
  SettlementLedger: SettlementLedger__factory.abi,
  ConsentRegistry: ConsentRegistry__factory.abi,
};

describe('notification rules', () => {
  it('listen only for events their contracts really emit', () => {
    const missing = Object.entries(RULES).flatMap(([contract, rules]) =>
      Object.keys(rules ?? {})
        .filter(
          (name) =>
            !ABIS[contract]?.some((x) => x.type === 'event' && x.name === name),
        )
        .map((name) => `${contract}.${name}`),
    );
    expect(missing).toEqual([]);
  });

  it('cover the events item 24 names and every queue on the dashboard', () => {
    const has = (contract: string, name: string) =>
      Object.keys(RULES[contract as keyof typeof RULES] ?? {}).includes(name);
    for (const [contract, name] of [
      ['ProjectLedger', 'SlotsReserved'],
      ['ProjectLedger', 'ReservationExpired'],
      ['VoucherRegistry', 'VoucherProposed'],
      ['VoucherRegistry', 'SaleRecorded'],
      ['TradeLedger', 'OfferMade'],
      ['TradeLedger', 'OfferApproved'],
      ['WarehouseReceipt', 'HandoverOffered'],
      ['InsuranceRegistry', 'ClaimOpened'],
      ['SettlementLedger', 'RoundPrepared'],
      ['SettlementLedger', 'RoundApproved'],
      ['AccessRegistry', 'ParticipantRegistered'],
    ]) {
      expect(`${contract}.${name}: ${has(contract, name)}`).toBe(
        `${contract}.${name}: true`,
      );
    }
  });

  it('tell everyone connected but the person who did it', async () => {
    const PROJECT = '11111111-1111-4111-8111-111111111111';
    const FARMER = '22222222-2222-4222-8222-222222222222';
    // The farmer's own key sent the transaction (as an example of a doer).
    const answers: Array<[RegExp, unknown[]]> = [
      [/FROM users WHERE account/, [{ id: FARMER }]],
      [/FROM projects WHERE id/, [{ title: 'Maize', farmer_id: FARMER }]],
      [/SELECT field_officer_id FROM users/, [{ field_officer_id: 'officer' }]],
      [/FROM reservations/, [{ investor_id: 'investor' }]],
    ];
    const m = {
      query: jest.fn((sql: string) =>
        Promise.resolve(answers.find(([re]) => re.test(sql))?.[1] ?? []),
      ),
    };
    const sent: Array<{ to: string[]; kind: string }> = [];
    const writer = {
      send: jest.fn(
        (_m: unknown, to: Iterable<string>, note: { kind: string }) => {
          sent.push({ to: [...to], kind: note.kind });
          return Promise.resolve(0);
        },
      ),
      withRole: jest.fn(() => Promise.resolve(['operations'])),
    } as unknown as NotificationWriter;
    const live: Array<(e: ChainEvent, m: unknown) => Promise<void>> = [];
    new NotificationRules(
      {
        onLive: (contract: string, name: string, h: (typeof live)[number]) => {
          if (contract === 'ProjectLedger' && name === 'ProjectStageChanged')
            live.push(h);
        },
      } as never,
      writer,
    ).onModuleInit();
    await live[0]!(
      {
        blockNumber: 1,
        logIndex: 0,
        txFrom: '0xfarmer',
        args: { projectId: uuidToBytes32(PROJECT), newStage: '3' },
      } as unknown as ChainEvent,
      m,
    );
    expect(sent).toEqual([
      { to: ['operations'], kind: 'project.funded' },
      { to: ['officer', 'investor'], kind: 'project.fully-funded' },
    ]);
  });
  /**
   * Runs one event through its rule against scripted database answers and
   * returns who was told what. The doer is nobody here.
   */
  async function notify(
    contract: string,
    name: string,
    args: Record<string, unknown>,
    answers: Array<[RegExp, unknown[]]> = [],
  ) {
    const m = {
      query: jest.fn((sql: string) =>
        Promise.resolve(answers.find(([re]) => re.test(sql))?.[1] ?? []),
      ),
    };
    const sent: Array<{
      to: string[];
      kind: string;
      body?: string;
      params?: object;
    }> = [];
    const writer = {
      send: jest.fn(
        (
          _m: unknown,
          to: Iterable<string | null>,
          note: { kind: string; body?: string; params?: object },
        ) => {
          sent.push({
            to: [...to].filter((t): t is string => !!t),
            kind: note.kind,
            body: note.body,
            params: note.params,
          });
          return Promise.resolve(0);
        },
      ),
      withRole: jest.fn(() => Promise.resolve(['admin'])),
    } as unknown as NotificationWriter;
    const handlers = new Map<
      string,
      (e: ChainEvent, m: unknown) => Promise<void>
    >();
    new NotificationRules(
      {
        onLive: (
          c: string,
          n: string,
          h: (e: ChainEvent, m: unknown) => Promise<void>,
        ) => handlers.set(`${c}.${n}`, h),
      } as never,
      writer,
    ).onModuleInit();
    await handlers.get(`${contract}.${name}`)!(
      {
        blockNumber: 1,
        logIndex: 0,
        txFrom: '0xnobody',
        blockTime: new Date('2026-10-14T00:00:00Z'),
        args,
      } as unknown as ChainEvent,
      m,
    );
    return sent;
  }

  it("tells the farmer's officer when a buy-back offer is withdrawn or declined", async () => {
    const sent = await notify(
      'WarehouseReceipt',
      'HandoverCancelled',
      { receiptId: `0x${'ab'.repeat(32)}` },
      [
        [/FROM warehouse_receipts/, [{ owner_id: 'farmer' }]],
        [
          /SELECT field_officer_id FROM users/,
          [{ field_officer_id: 'officer' }],
        ],
      ],
    );
    expect(sent).toEqual([
      expect.objectContaining({ to: ['officer'], kind: 'handover.cancelled' }),
    ]);
  });

  it('tells the officers of banks with current permission about a new track record version', async () => {
    const FARMER = '33333333-3333-4333-8333-333333333333';
    const sent = await notify(
      'ConsentRegistry',
      'TrackRecordPublished',
      { farmerId: uuidToBytes32(FARMER), version: 2n },
      [[/FROM bank_consents/, [{ officer_id: 'bank-officer' }]]],
    );
    expect(sent.map((x) => [x.to, x.kind])).toEqual([
      [[FARMER], 'track-record.published'],
      [['bank-officer'], 'track-record.updated'],
    ]);
  });

  it('names a crop it cannot read by nothing rather than failing', async () => {
    const sent = await notify('WarehouseReceipt', 'ReceiptIssued', {
      receiptId: `0x${'ab'.repeat(32)}`,
      owner: uuidToBytes32('44444444-4444-4444-8444-444444444444'),
      produceCode: 'not-a-code',
      quantity: 500n,
    });
    expect(sent[0].body).toBe('500  in storage');
  });
});
