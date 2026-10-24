import {
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AbiCoder,
  dataSlice,
  ErrorFragment,
  type Interface,
  isHexString,
} from 'ethers';
import { ErrorCode } from '../../common/errors/error-code';

/**
 * HTTP status for every custom error the platform contracts can raise. Kept
 * explicit, never guessed from the name; a unit test checks that every error
 * in the ABIs appears here and nothing stale does.
 */
export const CONTRACT_ERROR_STATUS: Record<string, HttpStatus> = {
  // Caller may not do this.
  AccessControlBadConfirmation: HttpStatus.FORBIDDEN,
  AccessControlUnauthorizedAccount: HttpStatus.FORBIDDEN,
  MissingRole: HttpStatus.FORBIDDEN,
  NotAuthorized: HttpStatus.FORBIDDEN,
  NotFarmersOfficer: HttpStatus.FORBIDDEN,
  NotSiteOperator: HttpStatus.FORBIDDEN,
  NotProjectInsurer: HttpStatus.FORBIDDEN,
  NotAssignedToBank: HttpStatus.FORBIDDEN,
  SameAccountant: HttpStatus.FORBIDDEN,
  RoleManagedByRegistry: HttpStatus.FORBIDDEN,
  NoActiveConsent: HttpStatus.FORBIDDEN,

  // The thing referred to does not exist.
  BankNotFound: HttpStatus.NOT_FOUND,
  BatchNotFound: HttpStatus.NOT_FOUND,
  ClaimNotFound: HttpStatus.NOT_FOUND,
  CostNotFound: HttpStatus.NOT_FOUND,
  EntryNotFound: HttpStatus.NOT_FOUND,
  EventNotFound: HttpStatus.NOT_FOUND,
  ListingNotFound: HttpStatus.NOT_FOUND,
  NoTrackRecord: HttpStatus.NOT_FOUND,
  NotAPayee: HttpStatus.NOT_FOUND,
  OfferNotFound: HttpStatus.NOT_FOUND,
  ParticipantNotFound: HttpStatus.NOT_FOUND,
  ProjectNotFound: HttpStatus.NOT_FOUND,
  ReceiptNotFound: HttpStatus.NOT_FOUND,
  RequestNotFound: HttpStatus.NOT_FOUND,
  ReservationNotFound: HttpStatus.NOT_FOUND,
  RoundNotFound: HttpStatus.NOT_FOUND,
  SaleNotFound: HttpStatus.NOT_FOUND,
  SiteNotFound: HttpStatus.NOT_FOUND,
  VoucherNotFound: HttpStatus.NOT_FOUND,

  // Conflicts with the current state: duplicates, wrong stage, already done.
  AccountAlreadyUsed: HttpStatus.CONFLICT,
  AlreadyClaimed: HttpStatus.CONFLICT,
  AlreadyConfirmed: HttpStatus.CONFLICT,
  AlreadyPaid: HttpStatus.CONFLICT,
  AlreadyRefunded: HttpStatus.CONFLICT,
  AlreadySettled: HttpStatus.CONFLICT,
  BankExists: HttpStatus.CONFLICT,
  BatchExists: HttpStatus.CONFLICT,
  BatchExpired: HttpStatus.CONFLICT,
  ClaimExists: HttpStatus.CONFLICT,
  CostAlreadyVoided: HttpStatus.CONFLICT,
  DealsPending: HttpStatus.CONFLICT,
  EntryExists: HttpStatus.CONFLICT,
  EventExists: HttpStatus.CONFLICT,
  FarmerNotWithOfficer: HttpStatus.CONFLICT,
  InsurerAlreadyAssigned: HttpStatus.CONFLICT,
  InsurerFixed: HttpStatus.CONFLICT,
  ListingClosed: HttpStatus.CONFLICT,
  NoInsurerAssigned: HttpStatus.CONFLICT,
  NotExternal: HttpStatus.CONFLICT,
  NotPendingListing: HttpStatus.CONFLICT,
  NothingToDistribute: HttpStatus.CONFLICT,
  NothingToRefund: HttpStatus.CONFLICT,
  OfficerHasFarmers: HttpStatus.CONFLICT,
  ParticipantAlreadyRegistered: HttpStatus.CONFLICT,
  PaymentOverdue: HttpStatus.CONFLICT,
  DealNotYetDue: HttpStatus.CONFLICT,
  PaymentRefAlreadyUsed: HttpStatus.CONFLICT,
  PaymentRefUsed: HttpStatus.CONFLICT,
  ProjectExists: HttpStatus.CONFLICT,
  ProjectNotFinished: HttpStatus.CONFLICT,
  ReceiptExists: HttpStatus.CONFLICT,
  ReceiptExpired: HttpStatus.CONFLICT,
  RequestClosed: HttpStatus.CONFLICT,
  ReservationHasExpired: HttpStatus.CONFLICT,
  ReservationNotOnHold: HttpStatus.CONFLICT,
  ReservationNotPending: HttpStatus.CONFLICT,
  ReservationNotYetExpired: HttpStatus.CONFLICT,
  ReservationOnHold: HttpStatus.CONFLICT,
  RoundOpen: HttpStatus.CONFLICT,
  SaleHasExpired: HttpStatus.CONFLICT,
  SaleNotPending: HttpStatus.CONFLICT,
  SaleNotYetExpired: HttpStatus.CONFLICT,
  SiteExists: HttpStatus.CONFLICT,
  SiteIsClosed: HttpStatus.CONFLICT,
  StatusUnchanged: HttpStatus.CONFLICT,
  StillOutstanding: HttpStatus.CONFLICT,
  TooEarly: HttpStatus.CONFLICT,
  VoucherExists: HttpStatus.CONFLICT,
  WrongClaimStatus: HttpStatus.CONFLICT,
  WrongOfferStatus: HttpStatus.CONFLICT,
  WrongProjectStage: HttpStatus.CONFLICT,
  WrongRoundStatus: HttpStatus.CONFLICT,
  WrongStage: HttpStatus.CONFLICT,
  WrongStatus: HttpStatus.CONFLICT,
  WrongVoucherStatus: HttpStatus.CONFLICT,

  // Well-formed, but breaks a business rule against other records.
  BatchNotOwned: HttpStatus.UNPROCESSABLE_ENTITY,
  CorrectionMismatch: HttpStatus.UNPROCESSABLE_ENTITY,
  CoverageBelowApproved: HttpStatus.UNPROCESSABLE_ENTITY,
  ExceedsAvailable: HttpStatus.UNPROCESSABLE_ENTITY,
  ExceedsCoverage: HttpStatus.UNPROCESSABLE_ENTITY,
  ExceedsFundingTarget: HttpStatus.UNPROCESSABLE_ENTITY,
  ExceedsVoucherQuantity: HttpStatus.UNPROCESSABLE_ENTITY,
  FarmerNotVerified: HttpStatus.UNPROCESSABLE_ENTITY,
  InvalidRecipient: HttpStatus.UNPROCESSABLE_ENTITY,
  NoCoverage: HttpStatus.UNPROCESSABLE_ENTITY,
  NotAnInsurer: HttpStatus.UNPROCESSABLE_ENTITY,
  NotABankOfficer: HttpStatus.UNPROCESSABLE_ENTITY,
  NotAFarmer: HttpStatus.UNPROCESSABLE_ENTITY,
  NotAFieldOfficer: HttpStatus.UNPROCESSABLE_ENTITY,
  NotAWarehouseOperator: HttpStatus.UNPROCESSABLE_ENTITY,
  NotSelfRegistrable: HttpStatus.UNPROCESSABLE_ENTITY,
  NotEnoughSlots: HttpStatus.UNPROCESSABLE_ENTITY,
  NotFarmersProject: HttpStatus.UNPROCESSABLE_ENTITY,
  NotInsured: HttpStatus.UNPROCESSABLE_ENTITY,
  NotPerishable: HttpStatus.UNPROCESSABLE_ENTITY,
  NotStaged: HttpStatus.UNPROCESSABLE_ENTITY,
  NotStorable: HttpStatus.UNPROCESSABLE_ENTITY,
  ProduceMismatch: HttpStatus.UNPROCESSABLE_ENTITY,
  RegionMismatch: HttpStatus.UNPROCESSABLE_ENTITY,
  SameFieldOfficer: HttpStatus.UNPROCESSABLE_ENTITY,
  SupplierNotApproved: HttpStatus.UNPROCESSABLE_ENTITY,
  SupplierNotVerified: HttpStatus.UNPROCESSABLE_ENTITY,
  TooManyFarmers: HttpStatus.UNPROCESSABLE_ENTITY,

  // Malformed input.
  BadBatchList: HttpStatus.BAD_REQUEST,
  BadProjectList: HttpStatus.BAD_REQUEST,
  BadSupplierList: HttpStatus.BAD_REQUEST,
  BadFeeSlabs: HttpStatus.BAD_REQUEST,
  InvalidDates: HttpStatus.BAD_REQUEST,
  InvalidDuration: HttpStatus.BAD_REQUEST,
  InvalidExpiry: HttpStatus.BAD_REQUEST,
  InvalidObservedAt: HttpStatus.BAD_REQUEST,
  InvalidQuantity: HttpStatus.BAD_REQUEST,
  InvalidSlotPricing: HttpStatus.BAD_REQUEST,
  InvalidSplit: HttpStatus.BAD_REQUEST,
  InvalidValidUntil: HttpStatus.BAD_REQUEST,
  TooManySlots: HttpStatus.BAD_REQUEST,
  UnknownRole: HttpStatus.BAD_REQUEST,
  ZeroAddress: HttpStatus.BAD_REQUEST,
  ZeroValue: HttpStatus.BAD_REQUEST,

  // Constructor-only: can only mean a broken deployment.
  ZeroDependency: HttpStatus.INTERNAL_SERVER_ERROR,
  ZeroProjectLedger: HttpStatus.INTERNAL_SERVER_ERROR,
  ZeroRegistry: HttpStatus.INTERNAL_SERVER_ERROR,
};

/** Every code a ledger refusal can carry: the contracts' errors and Solidity's own. */
export const LEDGER_ERROR_CODES: readonly string[] = [
  ...Object.keys(CONTRACT_ERROR_STATUS),
  'Error',
  'Panic',
];

export interface DecodedRevert {
  name: string;
  args: Record<string, string>;
}

/** Response body of a contract rejection, beside the standard error fields. */
export interface ContractRevertBody {
  statusCode: number;
  error: string;
  message: string;
  code: string;
  details: Record<string, string>;
}

/** A transaction the contracts rejected, as an HTTP error the API returns. */
export class ContractRevertException extends HttpException {
  constructor(readonly revert: DecodedRevert) {
    const status = CONTRACT_ERROR_STATUS[revert.name] ?? HttpStatus.CONFLICT;
    const body: ContractRevertBody = {
      statusCode: status,
      error: reasonPhrase(status),
      message: humanise(revert.name),
      code: revert.name,
      details: revert.args,
    };
    super(body, status);
  }
}

/**
 * Decodes revert data from any platform contract. Built once from all the
 * contract interfaces: selector -> error fragment, so each decode is O(1).
 */
export class ContractErrorDecoder {
  private readonly bySelector = new Map<string, ErrorFragment>();

  constructor(interfaces: Iterable<Interface>) {
    for (const iface of interfaces) {
      iface.forEachError((fragment) => {
        if (!this.bySelector.has(fragment.selector)) {
          this.bySelector.set(fragment.selector, fragment);
        }
      });
    }
    // Solidity's built-in Error(string) and Panic(uint256).
    for (const sig of [
      'error Error(string reason)',
      'error Panic(uint256 code)',
    ]) {
      const fragment = ErrorFragment.from(sig);
      this.bySelector.set(fragment.selector, fragment);
    }
  }

  /** Every custom error name the decoder knows. */
  errorNames(): string[] {
    return [...this.bySelector.values()].map((f) => f.name);
  }

  decode(data: string): DecodedRevert | null {
    if (!isHexString(data) || data.length < 10) return null;
    const fragment = this.bySelector.get(data.slice(0, 10).toLowerCase());
    if (!fragment) return null;
    try {
      return { name: fragment.name, args: decodeErrorArgs(fragment, data) };
    } catch {
      // Selector known but arguments malformed: still report which error it was.
      return { name: fragment.name, args: {} };
    }
  }

  /**
   * Turns anything a contract call or transaction threw into an HttpException:
   * a decoded revert, 503 when the node is unreachable, or a generic 500.
   */
  toHttpException(error: unknown): HttpException {
    if (error instanceof HttpException) return error;
    const data = findRevertData(error);
    if (data) {
      const revert = this.decode(data);
      if (revert) return new ContractRevertException(revert);
    }
    if (isNodeUnavailable(error)) {
      return new ServiceUnavailableException({
        message: 'Blockchain node unavailable',
        code: ErrorCode.LEDGER_UNAVAILABLE,
      });
    }
    return new InternalServerErrorException({
      message: 'Blockchain transaction failed',
      code: ErrorCode.LEDGER_FAILED,
    });
  }
}

function decodeErrorArgs(
  fragment: ErrorFragment,
  data: string,
): Record<string, string> {
  const values = AbiCoder.defaultAbiCoder().decode(
    fragment.inputs,
    dataSlice(data, 4),
  );
  const args: Record<string, string> = {};
  fragment.inputs.forEach((input, i) => {
    args[input.name || `arg${i}`] = String(values[i]);
  });
  return args;
}

/** Revert data sits at different depths depending on where ethers caught it. */
export function findRevertData(error: unknown, depth = 0): string | null {
  if (!error || typeof error !== 'object' || depth > 5) return null;
  const e = error as Record<string, unknown>;
  if (
    typeof e.data === 'string' &&
    isHexString(e.data) &&
    e.data.length >= 10
  ) {
    return e.data;
  }
  for (const key of ['error', 'info', 'cause', 'revert']) {
    const nested = findRevertData(e[key], depth + 1);
    if (nested) return nested;
  }
  return null;
}

const UNAVAILABLE_CODES = new Set([
  'NETWORK_ERROR',
  'TIMEOUT',
  'SERVER_ERROR',
  'ECONNREFUSED',
]);

function isNodeUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; cause?: unknown; error?: unknown };
  if (typeof e.code === 'string' && UNAVAILABLE_CODES.has(e.code)) return true;
  return isNodeUnavailable(e.cause) || isNodeUnavailable(e.error);
}

/** "WrongProjectStage" -> "Wrong project stage". */
export function humanise(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const REASON: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
};

function reasonPhrase(status: number): string {
  return REASON[status] ?? 'Error';
}
