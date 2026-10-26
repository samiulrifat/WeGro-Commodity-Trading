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
});
