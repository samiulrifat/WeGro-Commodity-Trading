import { ErrorCode } from '../../common/errors/error-code';
import { type Problem, problem } from '../../common/errors/problem';

/** Problems reported per import; the rest are counted, not listed. */
export const MAX_PROBLEMS = 20;

export interface ListedBankRow {
  code: number;
  name: string;
}

export interface ListedDistrictRow {
  code: number;
  name: string;
}

export interface ListedBranchRow {
  routingNumber: string;
  bankCode: number;
  districtCode: number;
  branchCode: number;
  name: string;
}

export interface BankListData {
  banks: ListedBankRow[];
  districts: ListedDistrictRow[];
  branches: ListedBranchRow[];
}

export type ParsedBankList =
  { ok: true; list: BankListData } | { ok: false; problems: Problem[] };

/** The two files as published: branches by bank, and optionally the districts. */
export const BRANCHES_FILE = 'bank_branches.json';
export const DISTRICTS_FILE = 'districts.json';

const NAME_MAX = 100;
const CODE_MAX = 32767; // smallint

/**
 * Reads the bank list files (`{ banks: [{ bank_code, bank_name, branches:
 * [{ district_code, district_name, branch_code, branch_name, routing_number }] }] }`
 * and `{ districts: [{ district_code, district_name }] }`), checking every
 * entry. Districts come from the branches; the districts file, when given,
 * must agree with them. Routing numbers are 9 digits, the first three the
 * bank's code: those that lost a leading zero (banks below 100) get it back.
 */
export function parseBankList(
  branchesJson: unknown,
  districtsJson?: unknown,
): ParsedBankList {
  const problems: Problem[] = [];
  let more = 0;
  const report = (p: Problem) => {
    if (problems.length < MAX_PROBLEMS) problems.push(p);
    else more++;
  };
  const invalid = (file: string, entry: string, field: string) =>
    report(
      problem(
        ErrorCode.BANK_LIST_ENTRY_INVALID,
        `${file}, ${entry}: ${field} is missing or wrong`,
        { file, entry, field },
      ),
    );

  const banksIn = arrayAt(branchesJson, 'banks');
  if (!banksIn) {
    return {
      ok: false,
      problems: [unreadable(BRANCHES_FILE, 'banks')],
    };
  }
  const districtsIn =
    districtsJson === undefined
      ? undefined
      : arrayAt(districtsJson, 'districts');
  if (districtsIn === null) {
    return {
      ok: false,
      problems: [unreadable(DISTRICTS_FILE, 'districts')],
    };
  }

  // District names as the districts file gives them, then as branches do.
  const districts = new Map<number, string>();
  districtsIn?.forEach((d, i) => {
    const entry = `district ${i + 1}`;
    const code = codeOf(field(d, 'district_code'));
    const name = nameOf(field(d, 'district_name'));
    if (code === null) return invalid(DISTRICTS_FILE, entry, 'district_code');
    if (name === null) return invalid(DISTRICTS_FILE, entry, 'district_name');
    if (districts.has(code)) {
      return report(duplicate(DISTRICTS_FILE, String(code)));
    }
    districts.set(code, name);
  });

  const banks: ListedBankRow[] = [];
  const bankCodes = new Set<number>();
  const branches: ListedBranchRow[] = [];
  const routings = new Set<string>();
  banksIn.forEach((b, i) => {
    const code = codeOf(field(b, 'bank_code'));
    const name = nameOf(field(b, 'bank_name'));
    const entry = `bank ${name ?? i + 1}`;
    if (code === null || code > 999) {
      return invalid(BRANCHES_FILE, entry, 'bank_code');
    }
    if (name === null) return invalid(BRANCHES_FILE, entry, 'bank_name');
    if (bankCodes.has(code))
      return report(duplicate(BRANCHES_FILE, String(code)));
    const list = field(b, 'branches');
    if (!Array.isArray(list)) return invalid(BRANCHES_FILE, entry, 'branches');
    bankCodes.add(code);
    banks.push({ code, name });
    const prefix = String(code).padStart(3, '0');
    list.forEach((br: unknown, j) => {
      const at = `${entry}, branch ${j + 1}`;
      const districtCode = codeOf(field(br, 'district_code'));
      const districtName = nameOf(field(br, 'district_name'));
      const branchCode = codeOf(field(br, 'branch_code'));
      const branchName = nameOf(field(br, 'branch_name'));
      const routingNumber = routingOf(field(br, 'routing_number'));
      if (districtCode === null)
        return invalid(BRANCHES_FILE, at, 'district_code');
      if (districtName === null)
        return invalid(BRANCHES_FILE, at, 'district_name');
      if (branchCode === null) return invalid(BRANCHES_FILE, at, 'branch_code');
      if (branchName === null) return invalid(BRANCHES_FILE, at, 'branch_name');
      if (routingNumber === null || !routingNumber.startsWith(prefix)) {
        return invalid(BRANCHES_FILE, at, 'routing_number');
      }
      if (routings.has(routingNumber)) {
        return report(duplicate(BRANCHES_FILE, routingNumber));
      }
      const known = districts.get(districtCode);
      if (known === undefined) {
        if (districtsIn) {
          return report(
            problem(
              ErrorCode.BANK_LIST_DISTRICT_UNKNOWN,
              `${at}: district ${districtCode} is not in the districts file`,
              { entry: at, districtCode },
            ),
          );
        }
        districts.set(districtCode, districtName);
      } else if (known !== districtName) {
        return report(
          problem(
            ErrorCode.BANK_LIST_DISTRICT_MISMATCH,
            `${at}: district ${districtCode} is ${districtName} here but ${known} elsewhere`,
            { entry: at, districtCode, name: districtName, expected: known },
          ),
        );
      }
      routings.add(routingNumber);
      branches.push({
        routingNumber,
        bankCode: code,
        districtCode,
        branchCode,
        name: branchName,
      });
    });
  });

  if (problems.length === 0 && branches.length === 0) {
    problems.push(
      problem(ErrorCode.BANK_LIST_EMPTY, 'The bank list has no branches'),
    );
  }
  if (more > 0) {
    problems.push(
      problem(ErrorCode.BANK_LIST_MORE_PROBLEMS, `... and ${more} more`, {
        count: more,
      }),
    );
  }
  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    list: {
      banks,
      districts: [...districts].map(([code, name]) => ({ code, name })),
      branches,
    },
  };
}

function unreadable(file: string, key: string): Problem {
  return problem(
    ErrorCode.BANK_LIST_UNREADABLE,
    `${file} must be JSON with a "${key}" list`,
    { file, key },
  );
}

function duplicate(file: string, value: string): Problem {
  return problem(
    ErrorCode.BANK_LIST_DUPLICATE,
    `${file}: ${value} appears more than once`,
    { file, value },
  );
}

function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function arrayAt(json: unknown, key: string): unknown[] | null {
  const value = field(json, key);
  return Array.isArray(value) ? value : null;
}

function codeOf(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= CODE_MAX
    ? value
    : null;
}

function nameOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  return name.length > 0 && name.length <= NAME_MAX ? name : null;
}

/** 9 digits; 8 when the file dropped the leading zero of a bank below 100. */
function routingOf(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{8,9}$/.test(value)) return null;
  return value.padStart(9, '0');
}
