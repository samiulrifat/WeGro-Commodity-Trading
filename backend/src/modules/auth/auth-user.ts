import { ChainState } from '../users/entities/user.entity';
import { ParticipantStatus, Role } from '../users/roles';

/** The signed-in user attached to each request, freshly loaded from the database. */
export interface AuthUser {
  id: string;
  role: Role;
  status: ParticipantStatus;
  chainState: ChainState;
  keyIndex: number;
  mustChangePassword: boolean;
}

/** Signed claims in an access token. */
export interface AccessTokenClaims {
  sub: string;
  role: Role;
  /** User's token version when issued; a mismatch means the token was revoked. */
  tv: number;
}

/** Verified participant (or the super admin): may act in their role. */
export function canAct(user: AuthUser): boolean {
  return (
    user.role === Role.SUPER_ADMIN ||
    (user.status === ParticipantStatus.VERIFIED &&
      user.chainState === ChainState.CONFIRMED)
  );
}
