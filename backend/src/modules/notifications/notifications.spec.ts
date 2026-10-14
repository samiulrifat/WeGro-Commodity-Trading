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
import { RULES } from './notification-rules';

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
});
