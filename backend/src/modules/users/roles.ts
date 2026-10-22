import { id } from 'ethers';

/**
 * Platform roles. `super_admin` is the platform operator (key index 0, the
 * contracts' DEFAULT_ADMIN_ROLE); the other twelve are AccessRegistry roles.
 */
export enum Role {
  SUPER_ADMIN = 'super_admin',
  INVESTOR = 'investor',
  FARMER = 'farmer',
  FIELD_OFFICER = 'field_officer',
  ADMIN = 'admin',
  ACCOUNTS = 'accounts',
  OPERATIONS = 'operations',
  WAREHOUSE = 'warehouse',
  BANK = 'bank',
  SUPPLIER = 'supplier',
  BUYER = 'buyer',
  INSURER = 'insurer',
  AUDITOR = 'auditor',
}

export type ParticipantRole = Exclude<Role, Role.SUPER_ADMIN>;

export const PARTICIPANT_ROLES = Object.values(Role).filter(
  (r): r is ParticipantRole => r !== Role.SUPER_ADMIN,
);

/** Staff roles: only the super admin registers, verifies or rejects them (as on-chain). */
export const STAFF_ROLES: ReadonlySet<Role> = new Set([
  Role.ADMIN,
  Role.ACCOUNTS,
  Role.FIELD_OFFICER,
  Role.AUDITOR,
  Role.OPERATIONS,
]);

export const isStaffRole = (role: Role) => STAFF_ROLES.has(role);

/**
 * Office roles: the super admin holds every one of their powers (adding,
 * editing, removing, approving), never those of people outside the office.
 */
export const OFFICE_ROLES: ReadonlySet<Role> = new Set([
  Role.ADMIN,
  Role.OPERATIONS,
  Role.ACCOUNTS,
  Role.AUDITOR,
]);

/** Whether someone with `actual` may act as `role`: the role itself, or the super admin for an office role. */
export const actsAs = (actual: Role, role: Role): boolean =>
  actual === role || (actual === Role.SUPER_ADMIN && OFFICE_ROLES.has(role));

/** On-chain role id: keccak256 of the Solidity constant's name, as in Roles.sol. */
export const CHAIN_ROLE: Readonly<Record<ParticipantRole, string>> = {
  [Role.INVESTOR]: id('INVESTOR_ROLE'),
  [Role.FARMER]: id('FARMER_ROLE'),
  [Role.FIELD_OFFICER]: id('FIELD_OFFICER_ROLE'),
  [Role.ADMIN]: id('ADMIN_ROLE'),
  [Role.ACCOUNTS]: id('ACCOUNTS_ROLE'),
  [Role.OPERATIONS]: id('OPERATIONS_ROLE'),
  [Role.WAREHOUSE]: id('WAREHOUSE_ROLE'),
  [Role.BANK]: id('BANK_ROLE'),
  [Role.SUPPLIER]: id('SUPPLIER_ROLE'),
  [Role.BUYER]: id('BUYER_ROLE'),
  [Role.INSURER]: id('INSURER_ROLE'),
  [Role.AUDITOR]: id('AUDITOR_ROLE'),
};

/** On-chain role id -> role, for decoding events in O(1). */
export const ROLE_BY_CHAIN_ID: ReadonlyMap<string, ParticipantRole> = new Map(
  PARTICIPANT_ROLES.map((r) => [CHAIN_ROLE[r], r]),
);

/** Mirrors AccessRegistry.Status (None is never stored: no row means none). */
export enum ParticipantStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

export const STATUS_BY_CHAIN: Readonly<Record<number, ParticipantStatus>> = {
  1: ParticipantStatus.PENDING,
  2: ParticipantStatus.VERIFIED,
  3: ParticipantStatus.REJECTED,
};
