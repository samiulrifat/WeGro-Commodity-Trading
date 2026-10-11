/**
 * Identity end to end: sign-in, sessions, the practice ID check and every
 * AccessRegistry action, through HTTP, against the local chain and a
 * throwaway database schema.
 */
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ContractsRegistry } from '../src/blockchain/contracts.registry';
import { EventIndexerService } from '../src/blockchain/indexer/event-indexer.service';
import { KeyService } from '../src/blockchain/keys/key.service';
import { uuidToBytes32 } from '../src/blockchain/utils/ids';
import { PasswordHasher } from '../src/common/crypto/password-hasher.service';
import { PersonalDetails } from '../src/modules/users/entities/personal-details.entity';
import { ChainState, User } from '../src/modules/users/entities/user.entity';
import { PersonalDetailsCodec } from '../src/modules/users/personal-details.codec';
import {
  CHAIN_ROLE,
  ParticipantStatus,
  Role,
} from '../src/modules/users/roles';
import { type ChainApp, startChainApp } from './support/chain-app';

const SUPER_PHONE = '01811000000';
const SUPER_PASSWORD = 'super-admin-pass-1';

let phoneSeq = 0;
/** Distinct, valid phone numbers for this run. */
const nextPhone = () =>
  `0181${String(1_000_000 + ++phoneSeq)
    .slice(1)
    .padStart(7, '0')}`;
/** Distinct 10-digit smart-card NIDs for this run. */
const nextNid = () => `${randomInt(2, 9)}${String(randomInt(1e8, 1e9))}`;

function person(role: Role, overrides: Record<string, string> = {}) {
  return {
    role,
    fullName: `Test ${role.replace('_', ' ')}`,
    phone: nextPhone(),
    nid: nextNid(),
    dateOfBirth: '1988-03-21',
    district: 'BOGURA',
    address: 'Made-up test address, Bogura',
    ...overrides,
  };
}

describe('Identity (node + database)', () => {
  let chain: ChainApp;
  let http: ReturnType<typeof request>;
  let db: DataSource;
  let contracts: ContractsRegistry;
  let keys: KeyService;

  /** Signs in and returns the access token and refresh cookie. */
  async function login(phone: string, password: string) {
    const res = await http
      .post('/api/auth/login')
      .send({ phone, password })
      .expect(200);
    return {
      token: res.body.data.accessToken as string,
      cookie: refreshCookie(res),
      mustChange: res.body.data.mustChangePassword as boolean,
    };
  }

  /** Signs in with the temporary password and sets a real one; returns a usable token. */
  async function activate(phone: string, temporaryPassword: string) {
    const first = await login(phone, temporaryPassword);
    expect(first.mustChange).toBe(true);
    const res = await http
      .post('/api/auth/change-password')
      .auth(first.token, { type: 'bearer' })
      .send({
        currentPassword: temporaryPassword,
        newPassword: `${phone}-real-pass`,
      })
      .expect(200);
    return res.body.data.accessToken as string;
  }

  function register(token: string, body: ReturnType<typeof person>) {
    return http
      .post('/api/participants')
      .auth(token, { type: 'bearer' })
      .send(body);
  }

  function verify(token: string, id: string, acknowledgeFlags?: boolean) {
    return http
      .post(`/api/participants/${id}/verify`)
      .auth(token, { type: 'bearer' })
      .send(acknowledgeFlags === undefined ? {} : { acknowledgeFlags });
  }

  // Shared cast, built up in order.
  let superToken: string;
  let admin: { id: string; phone: string; token: string };
  let officer: { id: string; phone: string; token: string };
  let farmer: { id: string; phone: string; temp: string; nid: string };

  beforeAll(async () => {
    chain = await startChainApp({ DEMO_MODE: 'false' });
    http = request(chain.app.getHttpServer());
    db = chain.app.get(DataSource);
    contracts = chain.app.get(ContractsRegistry);
    keys = chain.app.get(KeyService);

    // The super admin, as the create-super-admin script makes it.
    const codec = chain.app.get(PersonalDetailsCodec);
    const hasher = chain.app.get(PasswordHasher);
    await db.transaction(async (m) => {
      const user = await m.save(
        m.create(User, {
          role: Role.SuperAdmin,
          status: ParticipantStatus.Verified,
          chainState: ChainState.Operator,
          phoneIndex: codec.phoneIndex('+8801811000000'),
          passwordHash: await hasher.hash(SUPER_PASSWORD),
          keyIndex: 0,
          account: keys.operatorAddress(),
        }),
      );
      await m.insert(
        PersonalDetails,
        codec.sealOperator(user.id, 'Test Super Admin', '+8801811000000'),
      );
    });
  });

  afterAll(async () => {
    await chain?.close();
  });

  describe('sign-in', () => {
    it('gives the same answer for an unknown phone and a wrong password', async () => {
      const unknown = await http
        .post('/api/auth/login')
        .send({ phone: '01899999999', password: 'whatever-123' })
        .expect(401);
      const wrong = await http
        .post('/api/auth/login')
        .send({ phone: SUPER_PHONE, password: 'wrong-password' })
        .expect(401);
      expect(unknown.body.message).toBe(wrong.body.message);
    });

    it('signs in and sets the refresh token as a strict httpOnly cookie', async () => {
      const res = await http
        .post('/api/auth/login')
        .send({ phone: '+880 1811-000000', password: SUPER_PASSWORD })
        .expect(200);
      superToken = res.body.data.accessToken;
      expect(res.body.data).toMatchObject({
        tokenType: 'Bearer',
        expiresIn: 900,
        mustChangePassword: false,
        user: { role: 'super_admin', status: 'verified' },
      });
      expect(JSON.stringify(res.body)).not.toContain('refresh');
      const cookie = res.headers['set-cookie'][0];
      expect(cookie).toMatch(/^wegro_rt=[A-Za-z0-9_-]{43};/);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/Path=\/api\/auth/);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('requires a token everywhere except public routes', async () => {
      await http.get('/api/participants').expect(401);
      await http
        .get('/api/participants')
        .auth('not-a-jwt', { type: 'bearer' })
        .expect(401);
      await http.get('/api/health').expect(200);
    });
  });

  describe('registering staff', () => {
    it('lets the super admin register an admin, on-chain and encrypted', async () => {
      const body = person(Role.Admin);
      const res = await register(superToken, body).expect(201);
      const { participant, temporaryPassword } = res.body.data;
      expect(participant).toMatchObject({
        role: 'admin',
        status: 'pending',
        chainState: 'confirmed',
        phone: `+88${body.phone}`,
        idCheckOutcome: 'passed',
        masked: false,
      });
      expect(temporaryPassword).toMatch(/^.{4}-.{4}-.{4}$/);

      // On the ledger: pending, with the person's own key and the fingerprint.
      const onChain = await contracts
        .get('AccessRegistry')
        .getParticipant(uuidToBytes32(participant.id));
      expect(onChain.status).toBe(1n);
      expect(onChain.role).toBe(CHAIN_ROLE[Role.Admin]);
      expect(onChain.account).toBe(participant.account);

      const token = await activate(body.phone, temporaryPassword);
      admin = { id: participant.id, phone: body.phone, token };
    });

    it('keeps personal details out of the database in readable form', async () => {
      const [row] = await db.query(
        'SELECT d.*, u.phone_index FROM personal_details d JOIN users u ON u.id = d.user_id WHERE d.user_id = $1',
        [admin.id],
      );
      const raw = JSON.stringify(row);
      expect(raw).not.toContain(admin.phone.slice(1));
      expect(raw).not.toContain('Test admin');
      expect(raw).not.toContain('1988-03-21');
      expect(row.nid_enc).toMatch(/^v1\./);
      expect(row.district).toBe('BOGURA');
    });

    it('stops anyone but the super admin from registering staff', async () => {
      await register(admin.token, person(Role.Accounts)).expect(403);
    });

    it('does not let an unverified admin act', async () => {
      const res = await register(admin.token, person(Role.Investor)).expect(
        403,
      );
      expect(res.body.message).toBe('Your account is not verified');
    });

    it('verifies the admin on-chain', async () => {
      const res = await verify(superToken, admin.id).expect(200);
      expect(res.body.data.status).toBe('verified');
      await expect(
        contracts
          .get('AccessRegistry')
          .isVerifiedAs(uuidToBytes32(admin.id), CHAIN_ROLE[Role.Admin]),
      ).resolves.toBe(true);
      await verify(superToken, admin.id).expect(409);
    });

    it('registers and verifies a field officer', async () => {
      const body = person(Role.FieldOfficer);
      const res = await register(superToken, body).expect(201);
      const id = res.body.data.participant.id;
      await verify(superToken, id).expect(200);
      officer = {
        id,
        phone: body.phone,
        token: await activate(body.phone, res.body.data.temporaryPassword),
      };
    });
  });

  describe('temporary passwords', () => {
    it('allows only change-password, me and logout until changed', async () => {
      const body = person(Role.Investor);
      const res = await register(admin.token, body).expect(201);
      const { token } = await login(
        body.phone,
        res.body.data.temporaryPassword,
      );
      const blocked = await http
        .get('/api/participants/districts')
        .auth(token, { type: 'bearer' })
        .expect(403);
      expect(blocked.body.message).toBe('Change your temporary password first');
      const me = await http
        .get('/api/auth/me')
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(me.body.data).toMatchObject({
        role: 'investor',
        mustChangePassword: true,
      });
    });

    it('voids every older token when the password changes', async () => {
      const body = person(Role.Buyer);
      const res = await register(admin.token, body).expect(201);
      const first = await login(body.phone, res.body.data.temporaryPassword);
      await http
        .post('/api/auth/change-password')
        .auth(first.token, { type: 'bearer' })
        .send({
          currentPassword: res.body.data.temporaryPassword,
          newPassword: 'a-brand-new-pass',
        })
        .expect(200);
      await http
        .get('/api/auth/me')
        .auth(first.token, { type: 'bearer' })
        .expect(401);
      await http
        .post('/api/auth/refresh')
        .set('Cookie', first.cookie)
        .expect(401);
    });

    it('rejects a too-short new password', async () => {
      await http
        .post('/api/auth/change-password')
        .auth(admin.token, { type: 'bearer' })
        .send({
          currentPassword: `${admin.phone}-real-pass`,
          newPassword: 'short',
        })
        .expect(400);
    });
  });

  describe('the practice ID check', () => {
    it('lets a field officer register a farmer, who is assigned to them on-chain', async () => {
      // Old 17-digit NID issued in Dhaka (26), farmer lives in Bogura: flagged.
      const nid = `1988${'26'}${String(randomInt(1e10, 1e11))}`;
      const body = person(Role.Farmer, { nid });
      const res = await register(officer.token, body).expect(201);
      const p = res.body.data.participant;
      expect(p.idCheckOutcome).toBe('flagged');
      expect(p.fieldOfficerId).toBe(officer.id);
      expect(p.idCheck.checks).toContainEqual(
        expect.objectContaining({ code: 'NID_DISTRICT', result: 'warn' }),
      );
      farmer = {
        id: p.id,
        phone: body.phone,
        temp: res.body.data.temporaryPassword,
        nid,
      };
    });

    it('refuses the same NID again, even in its 13-digit form', async () => {
      const res = await register(
        admin.token,
        person(Role.Investor, { nid: farmer.nid.slice(4) }),
      ).expect(409);
      expect(res.body.code).toBe('NID_ALREADY_REGISTERED');
    });

    it('refuses a phone number already in use, however it is written', async () => {
      const res = await register(
        admin.token,
        person(Role.Investor, { phone: `+88 ${farmer.phone}` }),
      ).expect(409);
      expect(res.body.code).toBe('PHONE_ALREADY_REGISTERED');
    });

    it('lists every failed rule, without echoing the details', async () => {
      const res = await register(
        admin.token,
        person(Role.Investor, {
          nid: '19991012345678901',
          dateOfBirth: '2015-01-01',
        }),
      ).expect(422);
      expect(res.body.code).toBe('ID_CHECK_FAILED');
      const codes = res.body.details.checks.map(
        (c: { code: string }) => c.code,
      );
      expect(codes).toEqual(expect.arrayContaining(['AGE', 'NID_BIRTH_YEAR']));
      expect(JSON.stringify(res.body)).not.toContain('19991012345678901');
    });

    it('rejects unknown fields and bad roles', async () => {
      await register(admin.token, {
        ...person(Role.Investor),
        isAdmin: true,
      } as never).expect(400);
      await register(admin.token, person('super_admin' as Role)).expect(400);
    });

    it('makes the admin acknowledge flags before verifying', async () => {
      const res = await verify(admin.token, farmer.id).expect(422);
      expect(res.body.code).toBe('ID_CHECK_FLAGS_NOT_ACKNOWLEDGED');
      await verify(admin.token, farmer.id, true).expect(200);
    });
  });

  describe('integrity', () => {
    it('matches the stored details against the ledger fingerprint', async () => {
      const res = await http
        .get(`/api/participants/${farmer.id}/integrity`)
        .auth(admin.token, { type: 'bearer' })
        .expect(200);
      expect(res.body.data).toMatchObject({ matches: true, mismatches: [] });
      expect(res.body.data.computedHash).toBe(res.body.data.ledger.detailsHash);
    });

    it('detects tampered details and refuses to verify them', async () => {
      const body = person(Role.Supplier);
      const res = await register(admin.token, body).expect(201);
      const id = res.body.data.participant.id;
      // Swap in another person's (validly encrypted) address.
      await db.query(
        `UPDATE personal_details SET address_enc = (SELECT address_enc FROM personal_details WHERE user_id = $2) WHERE user_id = $1`,
        [id, farmer.id],
      );
      const report = await http
        .get(`/api/participants/${id}/integrity`)
        .auth(admin.token, { type: 'bearer' })
        .expect(200);
      expect(report.body.data.matches).toBe(false);
      expect(report.body.data.mismatches).toContain('decryption');
      const refused = await verify(admin.token, id).expect(409);
      expect(refused.body.code).toBe('DETAILS_MISMATCH');
    });
  });

  describe('who sees what', () => {
    let auditorToken: string;

    beforeAll(async () => {
      if (!http) return; // setup failed; its error is reported instead
      const body = person(Role.Auditor);
      const res = await register(superToken, body).expect(201);
      await verify(superToken, res.body.data.participant.id).expect(200);
      auditorToken = await activate(
        body.phone,
        res.body.data.temporaryPassword,
      );
    });

    it('masks personal details for the auditor', async () => {
      const res = await http
        .get(`/api/participants/${farmer.id}`)
        .auth(auditorToken, { type: 'bearer' })
        .expect(200);
      expect(res.body.data).toMatchObject({
        masked: true,
        dateOfBirth: null,
        address: null,
      });
      expect(res.body.data.nid).toMatch(/^•+\d{4}$/);
      expect(res.body.data.phone).toMatch(/•/);
      await http
        .post(`/api/participants/${farmer.id}/verify`)
        .auth(auditorToken, { type: 'bearer' })
        .send({})
        .expect(403);
    });

    it('shows a field officer only their own people', async () => {
      const list = await http
        .get('/api/participants')
        .auth(officer.token, { type: 'bearer' })
        .expect(200);
      expect(list.body.data.map((p: { id: string }) => p.id)).toEqual([
        farmer.id,
      ]);
      await http
        .get(`/api/participants/${admin.id}`)
        .auth(officer.token, { type: 'bearer' })
        .expect(404);
    });

    it('finds people by exact phone or NID without decrypting the table', async () => {
      const byPhone = await http
        .get(
          `/api/participants?phone=${encodeURIComponent(`+88${farmer.phone}`)}`,
        )
        .auth(admin.token, { type: 'bearer' })
        .expect(200);
      expect(byPhone.body.data.map((p: { id: string }) => p.id)).toEqual([
        farmer.id,
      ]);
      const byNid = await http
        .get(`/api/participants?nid=${farmer.nid.slice(4)}`)
        .auth(admin.token, { type: 'bearer' })
        .expect(200);
      expect(byNid.body.meta.total).toBe(1);
    });
  });

  describe('sessions', () => {
    it('rotates refresh tokens and ends the session when an old one is replayed', async () => {
      const first = await login(farmer.phone, farmer.temp);
      const rotated = await http
        .post('/api/auth/refresh')
        .set('Cookie', first.cookie)
        .expect(200);
      const second = refreshCookie(rotated);
      expect(second).not.toBe(first.cookie);

      // The first token comes back: treated as stolen.
      await http
        .post('/api/auth/refresh')
        .set('Cookie', first.cookie)
        .expect(401);
      await http.post('/api/auth/refresh').set('Cookie', second).expect(401);
      await http
        .get('/api/auth/me')
        .auth(rotated.body.data.accessToken, { type: 'bearer' })
        .expect(401);
    });

    it('locks an account after repeated wrong passwords', async () => {
      for (let i = 0; i < 5; i++) {
        await http
          .post('/api/auth/login')
          .send({ phone: officer.phone, password: 'definitely-wrong' })
          .expect(401);
      }
      const locked = await http
        .post('/api/auth/login')
        .send({ phone: officer.phone, password: `${officer.phone}-real-pass` })
        .expect(429);
      expect(locked.body.message).toMatch(/Try again in 1 minute/);
      await db.query(
        'UPDATE users SET locked_until = NULL, failed_login_count = 0 WHERE id = $1',
        [officer.id],
      );
    });

    it('counts wrong current passwords on change-password towards the lockout', async () => {
      const body = person(Role.Bank);
      const res = await register(admin.token, body).expect(201);
      const token = await activate(body.phone, res.body.data.temporaryPassword);
      for (let i = 0; i < 5; i++) {
        await http
          .post('/api/auth/change-password')
          .auth(token, { type: 'bearer' })
          .send({
            currentPassword: 'guess-number-x',
            newPassword: 'another-new-pass',
          })
          .expect(400);
      }
      await http
        .post('/api/auth/change-password')
        .auth(token, { type: 'bearer' })
        .send({
          currentPassword: `${body.phone}-real-pass`,
          newPassword: 'another-new-pass',
        })
        .expect(429);
      await http
        .post('/api/auth/login')
        .send({ phone: body.phone, password: `${body.phone}-real-pass` })
        .expect(429);
    });

    it('lets an admin reset a forgotten password, ending old sessions', async () => {
      const before = await login(farmer.phone, farmer.temp);
      const res = await http
        .post(`/api/participants/${farmer.id}/reset-password`)
        .auth(admin.token, { type: 'bearer' })
        .expect(200);
      await http
        .get('/api/auth/me')
        .auth(before.token, { type: 'bearer' })
        .expect(401);
      farmer.temp = res.body.data.temporaryPassword;
      expect((await login(farmer.phone, farmer.temp)).mustChange).toBe(true);
    });
  });

  describe('ledger actions', () => {
    it('replaces a key: the role moves to the new key and the old one retires', async () => {
      const access = contracts.get('AccessRegistry');
      const before = await db
        .getRepository(User)
        .findOneByOrFail({ id: farmer.id });
      const res = await http
        .post(`/api/participants/${farmer.id}/replace-key`)
        .auth(admin.token, { type: 'bearer' })
        .expect(200);
      const after = await db
        .getRepository(User)
        .findOneByOrFail({ id: farmer.id });

      expect(res.body.data.account).not.toBe(before.account);
      expect(after.keyIndex).not.toBe(before.keyIndex);
      expect(after.pendingKeyIndex).toBeNull();
      expect(keys.addressOf(after.keyIndex)).toBe(after.account);
      await expect(access.participantOf(after.account)).resolves.toBe(
        uuidToBytes32(farmer.id),
      );
      await expect(
        access.hasRole(CHAIN_ROLE[Role.Farmer], before.account),
      ).resolves.toBe(false);
      await expect(
        access.hasRole(CHAIN_ROLE[Role.Farmer], after.account),
      ).resolves.toBe(true);
    });

    it('reassigns a farmer to another verified field officer', async () => {
      const body = person(Role.FieldOfficer);
      const res = await register(superToken, body).expect(201);
      const second = res.body.data.participant.id;
      await http
        .put(`/api/participants/${farmer.id}/field-officer`)
        .auth(admin.token, { type: 'bearer' })
        .send({ officerId: second })
        .expect(400); // not verified yet
      await verify(superToken, second).expect(200);
      const moved = await http
        .put(`/api/participants/${farmer.id}/field-officer`)
        .auth(admin.token, { type: 'bearer' })
        .send({ officerId: second })
        .expect(200);
      expect(moved.body.data.fieldOfficerId).toBe(second);
    });

    it('rejects with a reason, revokes the role and signs the person out', async () => {
      const body = person(Role.Insurer);
      const res = await register(admin.token, body).expect(201);
      const id = res.body.data.participant.id;
      await verify(admin.token, id).expect(200);
      const session = await login(body.phone, res.body.data.temporaryPassword);

      const rejected = await http
        .post(`/api/participants/${id}/reject`)
        .auth(admin.token, { type: 'bearer' })
        .send({ reason: '  Documents did not match  ' })
        .expect(200);
      expect(rejected.body.data).toMatchObject({
        status: 'rejected',
        statusReason: 'Documents did not match',
      });
      await expect(
        contracts.get('AccessRegistry').isVerified(uuidToBytes32(id)),
      ).resolves.toBe(false);
      await http
        .get('/api/auth/me')
        .auth(session.token, { type: 'bearer' })
        .expect(401);
      await http
        .post('/api/auth/login')
        .send({ phone: body.phone, password: res.body.data.temporaryPassword })
        .expect(403);
    });

    it('lets only the super admin manage staff', async () => {
      await verify(admin.token, officer.id).expect(403);
      await http
        .post(`/api/participants/${officer.id}/reject`)
        .auth(admin.token, { type: 'bearer' })
        .send({ reason: 'no' })
        .expect(400); // too short, checked first
    });
  });

  describe('rebuilding from the ledger', () => {
    it('restores the same people after a full re-index', async () => {
      const snapshot = async () =>
        (
          await db.getRepository(User).find({
            order: { id: 'ASC' },
            select: {
              id: true,
              status: true,
              chainState: true,
              account: true,
              keyIndex: true,
              fieldOfficerId: true,
            },
          })
        ).map((u) => ({
          id: u.id,
          status: u.status,
          chainState: u.chainState,
          account: u.account,
          keyIndex: u.keyIndex,
          fieldOfficerId: u.fieldOfficerId,
        }));
      const before = await snapshot();

      const indexer = chain.app.get(EventIndexerService);
      await indexer.reindex();
      const midway = await db
        .getRepository(User)
        .countBy({ chainState: ChainState.Confirmed });
      expect(midway).toBe(0);
      await indexer.catchUp();

      expect(await snapshot()).toEqual(before);
    });

    it('agrees with the contracts on every role id', async () => {
      const access = contracts.get('AccessRegistry');
      await expect(access.FARMER_ROLE()).resolves.toBe(CHAIN_ROLE[Role.Farmer]);
      await expect(access.OPERATIONS_ROLE()).resolves.toBe(
        CHAIN_ROLE[Role.Operations],
      );
      await expect(access.AUDITOR_ROLE()).resolves.toBe(
        CHAIN_ROLE[Role.Auditor],
      );
    });
  });
});

function refreshCookie(res: request.Response): string {
  const header = res.headers['set-cookie'] as unknown as string[];
  return header[0].split(';')[0];
}
