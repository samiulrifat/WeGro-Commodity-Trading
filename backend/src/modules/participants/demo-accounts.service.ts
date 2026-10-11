import { randomBytes } from 'node:crypto';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KeyService } from '../../blockchain/keys/key.service';
import { PasswordHasher } from '../../common/crypto/password-hasher.service';
import type { EnvironmentVariables } from '../../config/env.validation';
import type { AuthUser } from '../auth/auth-user';
import { PersonalDetails } from '../users/entities/personal-details.entity';
import { ChainState, User } from '../users/entities/user.entity';
import { PersonalDetailsCodec } from '../users/personal-details.codec';
import { type ParticipantRole, ParticipantStatus, Role } from '../users/roles';
import { ParticipantsService } from './participants.service';

/** Staff first (the super admin registers them), then everyone the demo admin or officer registers. */
const STAFF: ParticipantRole[] = [
  Role.Admin,
  Role.FieldOfficer,
  Role.Accounts,
  Role.Operations,
  Role.Auditor,
];
const OTHERS: ParticipantRole[] = [
  Role.Farmer,
  Role.Investor,
  Role.Warehouse,
  Role.Bank,
  Role.Supplier,
  Role.Buyer,
  Role.Insurer,
];

const LABEL: Record<Role, string> = {
  [Role.SuperAdmin]: 'Super Admin',
  [Role.Investor]: 'Investor',
  [Role.Farmer]: 'Farmer',
  [Role.FieldOfficer]: 'Field Officer',
  [Role.Admin]: 'Admin',
  [Role.Accounts]: 'Accounts',
  [Role.Operations]: 'Operations',
  [Role.Warehouse]: 'Warehouse Operator',
  [Role.Bank]: 'Bank Officer',
  [Role.Supplier]: 'Supplier',
  [Role.Buyer]: 'Buyer',
  [Role.Insurer]: 'Insurer',
  [Role.Auditor]: 'Auditor',
};

/**
 * DEMO_MODE only: one ready-made, verified account per role, signed in
 * without a password through /auth/demo/login. Made-up details, marked
 * isDemo. Runs at startup and is idempotent: each account is created,
 * re-registered (after a chain reset) or verified only if needed.
 */
@Injectable()
export class DemoAccountsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoAccountsService.name);
  private readonly enabled: boolean;

  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly participants: ParticipantsService,
    private readonly codec: PersonalDetailsCodec,
    private readonly hasher: PasswordHasher,
    private readonly keys: KeyService,
  ) {
    this.enabled = config.get('DEMO_MODE', { infer: true });
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    // In the background: the API starts even if the chain is not up yet.
    void this.ensureAll().catch((error: unknown) =>
      this.logger.error(
        `Demo accounts not ready: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  async ensureAll(): Promise<void> {
    const operator = asActor(await this.ensureSuperAdmin());
    for (const role of STAFF) await this.ensure(role, operator, operator);

    const admin = asActor(await this.demoUser(Role.Admin));
    const officer = asActor(await this.demoUser(Role.FieldOfficer));
    for (const role of OTHERS) {
      // The officer registers the farmer, so the ledger assigns them to each other.
      await this.ensure(role, role === Role.Farmer ? officer : admin, admin);
    }
    this.logger.log('Demo accounts ready');
  }

  /** The existing super admin, or a demo one if none has been created. */
  private async ensureSuperAdmin(): Promise<User> {
    const existing = await this.users.findOne({
      where: { role: Role.SuperAdmin },
    });
    if (existing) return existing;
    const phone = demoPhone(0);
    const user = this.users.create({
      role: Role.SuperAdmin,
      status: ParticipantStatus.Verified,
      chainState: ChainState.Operator,
      phoneIndex: this.codec.phoneIndex(phone),
      passwordHash: await this.unusablePassword(),
      keyIndex: KeyService.OPERATOR_INDEX,
      account: this.keys.operatorAddress(),
      isDemo: true,
    });
    await this.users.manager.transaction(async (m) => {
      await m.save(user);
      await m.insert(
        PersonalDetails,
        this.codec.sealOperator(
          user.id,
          `Demo ${LABEL[Role.SuperAdmin]}`,
          phone,
        ),
      );
    });
    return user;
  }

  private async ensure(
    role: ParticipantRole,
    registrar: AuthUser,
    manager: AuthUser,
  ): Promise<void> {
    let user = await this.users.findOne({ where: { role, isDemo: true } });
    if (!user) {
      const { participant } = await this.participants.register(registrar, {
        role,
        fullName: `Demo ${LABEL[role]}`,
        phone: demoPhone(STAFF.concat(OTHERS).indexOf(role) + 1),
        nid: demoNid(role),
        dateOfBirth: '1990-01-15',
        district: 'BOGURA',
        address: 'Made-up demo address, Bogura Sadar',
      });
      await this.users.update(
        { id: participant.id },
        {
          isDemo: true,
          mustChangePassword: false,
          passwordHash: await this.unusablePassword(),
        },
      );
      user = await this.users.findOneByOrFail({ id: participant.id });
    } else {
      // Brings it back onto the ledger after a chain reset; no-op otherwise.
      await this.participants.syncWithLedger(manager, user.id);
      user = await this.users.findOneByOrFail({ id: user.id });
    }
    if (user.status !== ParticipantStatus.Verified) {
      await this.participants.verify(manager, user.id, true);
    }
  }

  private async demoUser(role: Role): Promise<User> {
    return this.users.findOneByOrFail({ role, isDemo: true });
  }

  /** Demo accounts sign in only through demo login: their password is random and discarded. */
  private unusablePassword(): Promise<string> {
    return this.hasher.hash(randomBytes(32).toString('base64'));
  }
}

function asActor(user: User): AuthUser {
  return {
    id: user.id,
    role: user.role,
    status: user.status,
    chainState: user.chainState,
    keyIndex: user.keyIndex,
    mustChangePassword: false,
  };
}

/** +88017000000NN: a block of made-up numbers. */
function demoPhone(n: number): string {
  return `+8801700000${String(n).padStart(3, '0')}`;
}

/** A made-up 10-digit smart-card NID per role. */
function demoNid(role: Role): string {
  const n = Object.values(Role).indexOf(role);
  return `59000000${String(n).padStart(2, '0')}`;
}
