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
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
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
      user.chainState === ChainState.Submitted
    ) {
      throw new UnauthorizedException({
        message: 'Session is no longer valid',
        code: ErrorCode.SessionEnded,
      });
    }
    return {
      id: user.id,
      role: user.role,
      status: user.status,
      chainState: user.chainState,
      keyIndex: user.keyIndex,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
