import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, IsNull, Repository } from 'typeorm';
import type { EnvironmentVariables } from '../../config/env.validation';
import { User } from '../users/entities/user.entity';
import type { AccessTokenClaims } from './auth-user';
import { RefreshToken } from './entities/refresh-token.entity';
import { ErrorCode } from '../../common/errors/error-code';

export const JWT_ISSUER = 'wegro-commodity-api';
export const JWT_AUDIENCE = 'wegro-commodity-app';

export interface IssuedTokens {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const hashToken = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('hex');

/** 256-bit random refresh tokens, base64url: exactly 43 characters. */
const REFRESH_TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlMs: number;

  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    private readonly jwt: JwtService,
    @InjectRepository(RefreshToken)
    private readonly tokens: Repository<RefreshToken>,
  ) {
    this.accessTtlSeconds = toSeconds(
      config.get('JWT_EXPIRES_IN', { infer: true }),
    );
    this.refreshTtlMs =
      config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * 86_400_000;
  }

  get refreshTtl(): number {
    return this.refreshTtlMs;
  }

  /** New session: a new refresh token family. */
  issue(
    user: Pick<User, 'id' | 'role' | 'tokenVersion'>,
    manager?: EntityManager,
  ): Promise<IssuedTokens> {
    return this.issueInFamily(user, randomUUID(), manager);
  }

  /**
   * Swaps a refresh token for a new pair. The old token is claimed with a
   * conditional update, so of two requests racing with the same token only
   * one can win; the other is treated as reuse.
   */
  async rotate(
    presented: string,
    loadUser: (id: string, m: EntityManager) => Promise<User | null>,
  ): Promise<{ user: User; tokens: IssuedTokens }> {
    if (!REFRESH_TOKEN_SHAPE.test(presented)) throw invalidSession();
    const tokenHash = hashToken(presented);

    const result = await this.tokens.manager.transaction(async (m) => {
      const row = await m.findOne(RefreshToken, { where: { tokenHash } });
      if (!row) return { error: 'unknown' as const };
      if (row.revokedAt) return { error: 'reused' as const, row };
      if (row.expiresAt.getTime() <= Date.now()) {
        return { error: 'expired' as const };
      }
      const claimed = await m.update(
        RefreshToken,
        { id: row.id, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      if (claimed.affected !== 1) return { error: 'reused' as const, row };

      const user = await loadUser(row.userId, m);
      if (!user) return { error: 'unknown' as const };
      const tokens = await this.issueInFamily(user, row.familyId, m);
      return { user, tokens };
    });

    if ('error' in result) {
      if (result.error === 'reused') {
        // A used token came back: someone holds a copy. End that whole session.
        this.logger.warn(
          `Refresh token reuse for user ${result.row.userId}; revoking the session`,
        );
        await this.revokeFamily(result.row.familyId);
        // Access tokens from that session may be copied too: void them all.
        await this.tokens.manager.increment(
          User,
          { id: result.row.userId },
          'tokenVersion',
          1,
        );
      }
      throw invalidSession();
    }
    return result;
  }

  async revokeFamilyOf(presented: string): Promise<void> {
    if (!REFRESH_TOKEN_SHAPE.test(presented)) return;
    const row = await this.tokens.findOne({
      where: { tokenHash: hashToken(presented) },
      select: { familyId: true },
    });
    if (row) await this.revokeFamily(row.familyId);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.tokens.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async revokeAllForUser(
    userId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager ?? this.tokens.manager).update(
      RefreshToken,
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private async issueInFamily(
    user: Pick<User, 'id' | 'role' | 'tokenVersion'>,
    familyId: string,
    manager?: EntityManager,
  ): Promise<IssuedTokens> {
    const claims: AccessTokenClaims = {
      sub: user.id,
      role: user.role,
      tv: user.tokenVersion,
    };
    const accessToken = await this.jwt.signAsync(claims, {
      algorithm: 'HS256',
      expiresIn: this.accessTtlSeconds,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      jwtid: randomUUID(),
    });
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs);
    await (manager ?? this.tokens.manager).insert(RefreshToken, {
      userId: user.id,
      familyId,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt,
      revokedAt: null,
    });
    return {
      accessToken,
      expiresIn: this.accessTtlSeconds,
      refreshToken,
      refreshExpiresAt,
    };
  }
}

function invalidSession() {
  return new UnauthorizedException({
    message: 'Session expired. Please sign in again.',
    code: ErrorCode.SESSION_EXPIRED,
  });
}

function toSeconds(value: string): number {
  const n = Number(value.slice(0, -1));
  const unit = value.slice(-1);
  return unit === 'h' ? n * 3600 : unit === 'm' ? n * 60 : n;
}
