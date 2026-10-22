import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { ChainState } from '../users/entities/user.entity';
import { actsAs, OFFICE_ROLES, ParticipantStatus, Role } from '../users/roles';
import { ROLES } from './decorators';
import { RolesGuard } from './guards';

/** A request by someone of `role` to an endpoint for `allowed`. */
function check(role: Role, allowed: Role[], method = 'POST'): boolean {
  const reflector = {
    getAllAndOverride: (key: string) => (key === ROLES ? allowed : undefined),
  } as unknown as Reflector;
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        user: {
          id: 'u1',
          role,
          status: ParticipantStatus.VERIFIED,
          chainState: ChainState.CONFIRMED,
          keyIndex: 1,
          mustChangePassword: false,
        },
      }),
    }),
  } as unknown as ExecutionContext;
  return new RolesGuard(reflector).canActivate(context);
}

describe('RolesGuard and the super admin', () => {
  it('lets the super admin do what any office role may, wherever it is listed', () => {
    for (const role of OFFICE_ROLES) {
      expect(check(Role.SUPER_ADMIN, [role])).toBe(true);
    }
    expect(check(Role.SUPER_ADMIN, [Role.ACCOUNTS, Role.SUPPLIER])).toBe(true);
  });

  it('never lets the super admin act as people outside the office', () => {
    for (const role of [
      Role.SUPPLIER,
      Role.BUYER,
      Role.FARMER,
      Role.INVESTOR,
      Role.WAREHOUSE,
      Role.FIELD_OFFICER,
      Role.BANK,
      Role.INSURER,
    ]) {
      expect(() => check(Role.SUPER_ADMIN, [role])).toThrow(ForbiddenException);
      expect(actsAs(Role.SUPER_ADMIN, role)).toBe(false);
    }
  });

  it('keeps every other role to its own lists', () => {
    expect(check(Role.ACCOUNTS, [Role.ACCOUNTS])).toBe(true);
    expect(() => check(Role.ADMIN, [Role.ACCOUNTS])).toThrow(
      ForbiddenException,
    );
    expect(() => check(Role.OPERATIONS, [Role.SUPER_ADMIN])).toThrow(
      ForbiddenException,
    );
  });
});
