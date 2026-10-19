import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUNDLED_DIR } from './bank-list.service';
import {
  BRANCHES_FILE,
  DISTRICTS_FILE,
  MAX_PROBLEMS,
  parseBankList,
} from './bank-list-file';

const branch = (over: Record<string, unknown> = {}) => ({
  district_code: 610,
  district_name: 'BOGRA',
  branch_code: 40,
  branch_name: 'BOGRA BAZAR',
  routing_number: '200100405',
  ...over,
});
const bank = (over: Record<string, unknown> = {}, branches = [branch()]) => ({
  bank_code: 200,
  bank_name: 'SONALI BANK LTD.',
  branches,
  ...over,
});
const codes = (r: ReturnType<typeof parseBankList>) =>
  r.ok ? [] : r.problems.map((p) => p.code);

describe('parseBankList', () => {
  it('reads banks, branches and the districts they name', () => {
    const r = parseBankList({ banks: [bank()] });
    expect(r).toEqual({
      ok: true,
      list: {
        banks: [{ code: 200, name: 'SONALI BANK LTD.' }],
        districts: [{ code: 610, name: 'BOGRA' }],
        branches: [
          {
            routingNumber: '200100405',
            bankCode: 200,
            districtCode: 610,
            branchCode: 40,
            name: 'BOGRA BAZAR',
          },
        ],
      },
    });
  });

  it('gives back the leading zero of banks below 100, and checks the bank prefix', () => {
    const agrani = bank({ bank_code: 10, bank_name: 'AGRANI BANK LTD.' }, [
      branch({ routing_number: '10010048' }),
    ]);
    const r = parseBankList({ banks: [agrani] });
    expect(r.ok && r.list.branches[0]?.routingNumber).toBe('010010048');
    // A routing number of another bank, or too short, is refused.
    expect(
      codes(
        parseBankList({
          banks: [
            bank({}, [
              branch({ routing_number: '185100438' }),
              branch({ routing_number: '2001004' }),
            ]),
          ],
        }),
      ),
    ).toEqual(['BANK_LIST_ENTRY_INVALID', 'BANK_LIST_ENTRY_INVALID']);
  });

  it('refuses duplicates and districts named two ways', () => {
    const r = parseBankList({
      banks: [
        bank({}, [
          branch(),
          branch(),
          branch({ routing_number: '200100434', district_name: 'BOGURA' }),
        ]),
        bank(),
      ],
    });
    expect(codes(r)).toEqual([
      'BANK_LIST_DUPLICATE',
      'BANK_LIST_DISTRICT_MISMATCH',
      'BANK_LIST_DUPLICATE',
    ]);
  });

  it('checks branches against the districts file when one is given', () => {
    const districts = {
      districts: [{ district_code: 610, district_name: 'BOGRA' }],
    };
    expect(parseBankList({ banks: [bank()] }, districts).ok).toBe(true);
    const r = parseBankList(
      { banks: [bank({}, [branch({ district_code: 611 })])] },
      districts,
    );
    expect(codes(r)).toEqual(['BANK_LIST_DISTRICT_UNKNOWN']);
    expect(codes(parseBankList({ banks: [bank()] }, { nope: [] }))).toEqual([
      'BANK_LIST_UNREADABLE',
    ]);
  });

  it('refuses files of the wrong shape, and an empty list', () => {
    expect(codes(parseBankList([]))).toEqual(['BANK_LIST_UNREADABLE']);
    expect(codes(parseBankList({ banks: [] }))).toEqual(['BANK_LIST_EMPTY']);
    expect(
      codes(
        parseBankList({
          banks: [bank({ bank_name: ' ' }), bank({ bank_code: 1000 })],
        }),
      ),
    ).toEqual(['BANK_LIST_ENTRY_INVALID', 'BANK_LIST_ENTRY_INVALID']);
  });

  it(`lists at most ${MAX_PROBLEMS} problems, then counts the rest`, () => {
    const bad = Array.from({ length: MAX_PROBLEMS + 5 }, () =>
      branch({ routing_number: 'x' }),
    );
    const r = parseBankList({ banks: [bank({}, bad)] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems).toHaveLength(MAX_PROBLEMS + 1);
    expect(r.problems.at(-1)).toMatchObject({
      code: 'BANK_LIST_MORE_PROBLEMS',
      details: { count: 5 },
    });
  });

  it('reads the official list that comes with the platform', () => {
    const read = (file: string): unknown =>
      JSON.parse(readFileSync(join(BUNDLED_DIR, file), 'utf8'));
    const r = parseBankList(read(BRANCHES_FILE), read(DISTRICTS_FILE));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.list.banks.length).toBeGreaterThan(50);
    expect(r.list.districts.length).toBeGreaterThanOrEqual(64);
    expect(r.list.branches.length).toBeGreaterThan(10_000);
    expect(r.list.branches.every((b) => /^\d{9}$/.test(b.routingNumber))).toBe(
      true,
    );
  });
});
