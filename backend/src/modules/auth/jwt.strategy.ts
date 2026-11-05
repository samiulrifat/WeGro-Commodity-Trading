import { createSecretKey } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import type { EnvironmentVariables } from '../../config/env.validation';
import { ChainState, User } from '../users/entities/user.entity';
import type { AccessTokenClaims, AuthUser } from './auth-user';
import { JWT_AUDIENCE, JWT_ISSUER } from './token.service';
import { ErrorCode } from '../../common/errors/error-code';

/**
 * Checks the access token (signature, HS256 only, issuer, audience, expiry),
 * then loads the user by primary key on every request, so a revoked token,
 * a role change or a rejection takes effect immediately rather than when the
 * token expires.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // The secret as a key object, made once: given a string, jsonwebtoken
      // first tries to read it as a public key on every request (a thrown
      // error each time), about 6% of the API's CPU under load. Its types
      // say string | Buffer; a KeyObject is what it uses either way.
      secretOrKey: createSecretKey(
        Buffer.from(config.get('JWT_SECRET', { infer: true })),
      ) as unknown as Buffer,
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      ignoreExpiration: false,
    });
  }

  async validate(claims: AccessTokenClaims): Promise<AuthUser> {
    const user = await this.users.findOne({
      where: { id: claims.sub },
      select: {
        id: true,
        role: true,
        extraRoles: true,
        status: true,
        chainState: true,
        keyIndex: true,
        mustChangePassword: true,
        tokenVersion: true,
      },
    });
    if (
      !user ||
      user.tokenVersion !== claims.tv ||
      user.role !== claims.role ||
      user.chainState === ChainState.SUBMITTED
    ) {
      throw new UnauthorizedException({
        message: 'Session is no longer valid',
        code: ErrorCode.SESSION_ENDED,
      });
    }
    return {
      id: user.id,
      role: user.role,
      extraRoles: user.extraRoles,
      status: user.status,
      chainState: user.chainState,
      keyIndex: user.keyIndex,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
