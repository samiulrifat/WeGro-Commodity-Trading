import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { id } from 'ethers';
import {
  AccessRegistry__factory,
  ConsentRegistry__factory,
  FieldRecordLog__factory,
  InsuranceRegistry__factory,
  ProjectLedger__factory,
  SettlementLedger__factory,
  TradeLedger__factory,
  VoucherRegistry__factory,
  WarehouseReceipt__factory,
} from '../../blockchain/generated';
import { codeToBytes32, uuidToBytes32 } from '../../blockchain/utils/ids';
import { AuditAction, Roles } from '../auth/decorators';
import { RolesGuard } from '../auth/guards';
import { ChainState } from '../users/entities/user.entity';
import { CHAIN_ROLE, ParticipantStatus, Role } from '../users/roles';
import { hasTitle, readableArgs } from './history/event-format';
import { HISTORY_TYPES } from './history/history-types';

const ABIS = {
  AccessRegistry: AccessRegistry__factory.abi,
  ProjectLedger: ProjectLedger__factory.abi,
  VoucherRegistry: VoucherRegistry__factory.abi,
  FieldRecordLog: FieldRecordLog__factory.abi,
  WarehouseReceipt: WarehouseReceipt__factory.abi,
  TradeLedger: TradeLedger__factory.abi,
  InsuranceRegistry: InsuranceRegistry__factory.abi,
  SettlementLedger: SettlementLedger__factory.abi,
  ConsentRegistry: ConsentRegistry__factory.abi,
} as const;

type AbiItem = {
  type: string;
  name?: string;
  inputs?: readonly { name: string }[];
};
const events = (abi: readonly AbiItem[]) =>
  abi.filter((x) => x.type === 'event');

describe('history against the contracts', () => {
  it('has a plain-language title for every ledger event', () => {
    const untitled = Object.values(ABIS)
      .flatMap((abi) => events(abi as readonly AbiItem[]))
      .map((e) => e.name!)
      .filter((name) => !hasTitle(name));
    expect(untitled).toEqual([]);
  });

  it('looks each record up only by argument names its contracts really emit', () => {
    for (const [type, def] of Object.entries(HISTORY_TYPES)) {
      for (const source of def.sources) {
        const abis = source.contract
          ? [ABIS[source.contract]]
          : Object.values(ABIS);
        const names = new Set(
          abis.flatMap((abi) =>
            events(abi as readonly AbiItem[]).flatMap((e) =>
              (e.inputs ?? []).map((i) => i.name),
            ),
          ),
        );
        for (const key of source.keys) {
          expect({ type, key, emitted: names.has(key) }).toEqual({
            type,
            key,
            emitted: true,
          });
        }
      }
    }
  });
});

describe('readable event arguments', () => {
  const PROJECT = '7d3f2c1a-0b4e-4f6a-9c8d-1e2f3a4b5c6d';

  it('shows money, times, stages, codes and ids the way people read them', () => {
    expect(
      readableArgs('ProjectLedger', {
        projectId: uuidToBytes32(PROJECT),
        slotPrice: '1000000',
        expiresAt: '1800000000',
        newStage: '4',
        previousStage: '3',
        termsHash: `0x${'ab'.repeat(32)}`,
      }),
    ).toEqual({
      projectId: PROJECT,
      slotPrice: '10000.00',
      expiresAt: '2027-01-15T08:00:00.000Z',
      newStage: 'active',
      previousStage: 'funded',
      termsHash: `0x${'ab'.repeat(32)}`,
    });
  });

  it('names roles, claim statuses, WeGro, codes and empty ids', () => {
    expect(
      readableArgs('AccessRegistry', {
        role: CHAIN_ROLE[Role.Farmer],
        newStatus: '2',
      }),
    ).toEqual({ role: 'farmer', newStatus: 'verified' });
    expect(
      readableArgs('InsuranceRegistry', {
        status: '3',
        regionCode: codeToBytes32('BOGURA'),
      }),
    ).toEqual({ status: 'approved', regionCode: 'BOGURA' });
    expect(
      readableArgs('TradeLedger', {
        seller: id('WEGRO'),
        receiptId: `0x${'0'.repeat(64)}`,
        produceCode: codeToBytes32('MAIZE'),
      }),
    ).toEqual({ seller: 'WEGRO', receiptId: null, produceCode: 'MAIZE' });
  });
});

describe('auditors only read', () => {
  const guard = new RolesGuard(new Reflector());
  const auditor = {
    id: 'a',
    role: Role.Auditor,
    status: ParticipantStatus.Verified,
    chainState: ChainState.Confirmed,
    keyIndex: 1,
    mustChangePassword: false,
  };
  const context = (method: string, handler: () => void) =>
    ({
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => ({ method, user: auditor }) }),
    }) as unknown as ExecutionContext;
  const route = (...decorators: MethodDecorator[]) => {
    class C {
      handler(): void {}
    }
    for (const d of decorators)
      d(
        C.prototype,
        'handler',
        Object.getOwnPropertyDescriptor(C.prototype, 'handler')!,
      );
    return Object.getOwnPropertyDescriptor(C.prototype, 'handler')!
      .value as () => void;
  };

  it('refuses an auditor any write, even where the role is listed', () => {
    const listed = route(Roles(Role.Admin, Role.Auditor));
    expect(guard.canActivate(context('GET', listed))).toBe(true);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(() => guard.canActivate(context(method, listed))).toThrow(
        'Auditors have read-only access',
      );
    }
  });

  it('allows the writes marked as audit actions', () => {
    const sweep = route(Roles(Role.Auditor), AuditAction());
    expect(guard.canActivate(context('POST', sweep))).toBe(true);
  });
});
