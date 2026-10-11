import { id } from 'ethers';

/**
 * Platform roles. `super_admin` is the platform operator (key index 0, the
 * contracts' DEFAULT_ADMIN_ROLE); the other twelve are AccessRegistry roles.
 */
export enum Role {
  SuperAdmin = 'super_admin',
  Investor = 'investor',
  Farmer = 'farmer',
  FieldOfficer = 'field_officer',
  Admin = 'admin',
  Accounts = 'accounts',
  Operations = 'operations',
  Warehouse = 'warehouse',
  Bank = 'bank',
  Supplier = 'supplier',
  Buyer = 'buyer',
  Insurer = 'insurer',
  Auditor = 'auditor',
}

export type ParticipantRole = Exclude<Role, Role.SuperAdmin>;

export const PARTICIPANT_ROLES = Object.values(Role).filter(
  (r): r is ParticipantRole => r !== Role.SuperAdmin,
);

/** Staff roles: only the super admin registers, verifies or rejects them (as on-chain). */
export const STAFF_ROLES: ReadonlySet<Role> = new Set([
  Role.Admin,
  Role.Accounts,
  Role.FieldOfficer,
  Role.Auditor,
  Role.Operations,
]);

export const isStaffRole = (role: Role) => STAFF_ROLES.has(role);

/** On-chain role id: keccak256 of the Solidity constant's name, as in Roles.sol. */
export const CHAIN_ROLE: Readonly<Record<ParticipantRole, string>> = {
  [Role.Investor]: id('INVESTOR_ROLE'),
  [Role.Farmer]: id('FARMER_ROLE'),
  [Role.FieldOfficer]: id('FIELD_OFFICER_ROLE'),
  [Role.Admin]: id('ADMIN_ROLE'),
  [Role.Accounts]: id('ACCOUNTS_ROLE'),
  [Role.Operations]: id('OPERATIONS_ROLE'),
  [Role.Warehouse]: id('WAREHOUSE_ROLE'),
  [Role.Bank]: id('BANK_ROLE'),
  [Role.Supplier]: id('SUPPLIER_ROLE'),
  [Role.Buyer]: id('BUYER_ROLE'),
  [Role.Insurer]: id('INSURER_ROLE'),
  [Role.Auditor]: id('AUDITOR_ROLE'),
};

/** On-chain role id -> role, for decoding events in O(1). */
export const ROLE_BY_CHAIN_ID: ReadonlyMap<string, ParticipantRole> = new Map(
  PARTICIPANT_ROLES.map((r) => [CHAIN_ROLE[r], r]),
);

/** Mirrors AccessRegistry.Status (None is never stored: no row means none). */
export enum ParticipantStatus {
  Pending = 'pending',
  Verified = 'verified',
  Rejected = 'rejected',
}

export const STATUS_BY_CHAIN: Readonly<Record<number, ParticipantStatus>> = {
  1: ParticipantStatus.Pending,
  2: ParticipantStatus.Verified,
  3: ParticipantStatus.Rejected,
};
