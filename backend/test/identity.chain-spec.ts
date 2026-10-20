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
import {
  EmailSender,
  MemoryEmailSender,
} from '../src/modules/auth/email/email-sender';
import { MemorySmsSender, SmsSender } from '../src/modules/auth/sms/sms-sender';
import { normalisePhone } from '../src/modules/participants/id-check/id-check';
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
    chain = await startChainApp({ DEMO_MODE: 'false', SMS_PROVIDER: 'memory' });
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
          role: Role.SUPER_ADMIN,
          status: ParticipantStatus.VERIFIED,
          chainState: ChainState.OPERATOR,
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
      for (const res of [unknown, wrong]) {
        expect(res.body).toMatchObject({
          error: 'Unauthorized',
          code: 'BAD_CREDENTIALS',
        });
      }
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
        user: { role: 'super_admin', status: 'verified', language: null },
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
      const body = person(Role.ADMIN);
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
      expect(onChain.role).toBe(CHAIN_ROLE[Role.ADMIN]);
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
      await register(admin.token, person(Role.ACCOUNTS)).expect(403);
    });

    it('does not let an unverified admin act', async () => {
      const res = await register(admin.token, person(Role.INVESTOR)).expect(
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
          .isVerifiedAs(uuidToBytes32(admin.id), CHAIN_ROLE[Role.ADMIN]),
      ).resolves.toBe(true);
      await verify(superToken, admin.id).expect(409);
    });

    it('registers and verifies a field officer', async () => {
      const body = person(Role.FIELD_OFFICER);
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
      const body = person(Role.INVESTOR);
      const res = await register(admin.token, body).expect(201);
      const { token } = await login(
        body.phone,
        res.body.data.temporaryPassword,
      );
      const blocked = await http
        .get('/api/catalog')
        .auth(token, { type: 'bearer' })
        .expect(403);
      expect(blocked.body).toMatchObject({
        message: 'Change your temporary password first',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
      const me = await http
        .get('/api/auth/me')
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(me.body.data).toMatchObject({
        role: 'investor',
        mustChangePassword: true,
        language: null,
      });
    });

    it('saves the language, even before the password is changed, and signs in with it', async () => {
      const body = person(Role.FARMER);
      const res = await register(admin.token, body).expect(201);
      const password = res.body.data.temporaryPassword as string;
      const { token } = await login(body.phone, password);
      const saved = await http
        .patch('/api/auth/me')
        .auth(token, { type: 'bearer' })
        .send({ language: 'bn' })
        .expect(200);
      expect(saved.body.data).toMatchObject({
        fullName: body.fullName,
        language: 'bn',
      });
      const again = await http
        .post('/api/auth/login')
        .send({ phone: body.phone, password })
        .expect(200);
      expect(again.body.data.user.language).toBe('bn');
      await http
        .patch('/api/auth/me')
        .auth(token, { type: 'bearer' })
        .send({ language: 'fr' })
        .expect(400);
      await http
        .patch('/api/auth/me')
        .auth(token, { type: 'bearer' })
        .send({ language: 'en', role: 'admin' })
        .expect(400);
      await http.patch('/api/auth/me').send({ language: 'en' }).expect(401);
    });

    it('voids every older token when the password changes', async () => {
      const body = person(Role.BUYER);
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
      const body = person(Role.FARMER, { nid });
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
        person(Role.INVESTOR, { nid: farmer.nid.slice(4) }),
      ).expect(409);
      expect(res.body.code).toBe('NID_ALREADY_REGISTERED');
    });

    it('refuses a phone number already in use, however it is written', async () => {
      const res = await register(
        admin.token,
        person(Role.INVESTOR, { phone: `+88 ${farmer.phone}` }),
      ).expect(409);
      expect(res.body.code).toBe('PHONE_ALREADY_REGISTERED');
    });

    it('lists every failed rule, without echoing the details', async () => {
      const res = await register(
        admin.token,
        person(Role.INVESTOR, {
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
        ...person(Role.INVESTOR),
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
      // Syncing a person the ledger already agrees with changes nothing.
      const synced = await http
        .post(`/api/participants/${farmer.id}/sync`)
        .auth(admin.token, { type: 'bearer' })
        .expect(200);
      expect(synced.body.data).toMatchObject({
        id: farmer.id,
        chainState: 'confirmed',
      });
    });

    it('detects tampered details and refuses to verify them', async () => {
      const body = person(Role.SUPPLIER);
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
      const body = person(Role.AUDITOR);
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
      expect(locked.body).toMatchObject({
        error: 'Too Many Requests',
        code: 'ACCOUNT_LOCKED',
        details: { minutes: 1 },
      });
      await db.query(
        'UPDATE users SET locked_until = NULL, failed_login_count = 0 WHERE id = $1',
        [officer.id],
      );
    });

    it('counts wrong current passwords on change-password towards the lockout', async () => {
      const body = person(Role.BANK);
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
        access.hasRole(CHAIN_ROLE[Role.FARMER], before.account),
      ).resolves.toBe(false);
      await expect(
        access.hasRole(CHAIN_ROLE[Role.FARMER], after.account),
      ).resolves.toBe(true);
    });

    it('reassigns a farmer to another verified field officer', async () => {
      const body = person(Role.FIELD_OFFICER);
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

    it('turns down a registration with a reason, and refuses that for someone verified', async () => {
      const body = person(Role.INSURER);
      const res = await register(admin.token, body).expect(201);
      const id = res.body.data.participant.id;
      const rejected = await http
        .post(`/api/participants/${id}/reject`)
        .auth(admin.token, { type: 'bearer' })
        .send({ reason: '  Documents did not match  ' })
        .expect(200);
      expect(rejected.body.data).toMatchObject({
        status: 'rejected',
        statusReason: 'Documents did not match',
        accessRevoked: false,
        revocation: null,
      });
      const refused = await http
        .post('/api/auth/login')
        .send({ phone: body.phone, password: res.body.data.temporaryPassword })
        .expect(403);
      expect(refused.body.code).toBe('ACCOUNT_REJECTED');

      const other = person(Role.INSURER);
      const made = await register(admin.token, other).expect(201);
      await verify(admin.token, made.body.data.participant.id).expect(200);
      const notThat = await http
        .post(`/api/participants/${made.body.data.participant.id}/reject`)
        .auth(admin.token, { type: 'bearer' })
        .send({ reason: 'No longer works with us' })
        .expect(409);
      expect(notThat.body.code).toBe('REJECT_VERIFIED');
    });

    it('revokes a verified person’s access with why, signs them out, and restores it', async () => {
      const body = person(Role.INSURER);
      const res = await register(admin.token, body).expect(201);
      const id = res.body.data.participant.id;
      await verify(admin.token, id).expect(200);
      const session = await login(body.phone, res.body.data.temporaryPassword);

      const revoked = await http
        .post(`/api/participants/${id}/revoke`)
        .auth(admin.token, { type: 'bearer' })
        .send({ reason: 'contract_ended', note: '  Policy year over  ' })
        .expect(200);
      expect(revoked.body.data).toMatchObject({
        status: 'rejected',
        accessRevoked: true,
        revocation: {
          reason: 'contract_ended',
          note: 'Policy year over',
          by: { id: admin.id },
        },
      });
      await expect(
        contracts.get('AccessRegistry').isVerified(uuidToBytes32(id)),
      ).resolves.toBe(false);
      await http
        .get('/api/auth/me')
        .auth(session.token, { type: 'bearer' })
        .expect(401);
      const refused = await http
        .post('/api/auth/login')
        .send({ phone: body.phone, password: res.body.data.temporaryPassword })
        .expect(403);
      expect(refused.body.code).toBe('ACCESS_REVOKED');

      const restored = await verify(admin.token, id).expect(200);
      expect(restored.body.data).toMatchObject({
        status: 'verified',
        accessRevoked: false,
        revocation: null,
      });
      await login(body.phone, res.body.data.temporaryPassword);
    });

    it('moves a leaving field officer’s farmers to another, then revokes, ledger and all', async () => {
      const access = contracts.get('AccessRegistry');
      const make = async (role: Role, token: string) => {
        const res = await register(token, person(role)).expect(201);
        const id: string = res.body.data.participant.id;
        await verify(token, id).expect(200);
        return id;
      };
      const leaving = await make(Role.FIELD_OFFICER, superToken);
      const next = await make(Role.FIELD_OFFICER, superToken);
      const farmers: string[] = [];
      for (let i = 0; i < 2; i++) {
        const f = await make(Role.FARMER, admin.token);
        await http
          .put(`/api/participants/${f}/field-officer`)
          .auth(admin.token, { type: 'bearer' })
          .send({ officerId: leaving })
          .expect(200);
        farmers.push(f);
      }

      const work = await http
        .get(`/api/participants/${leaving}/open-work`)
        .auth(superToken, { type: 'bearer' })
        .expect(200);
      expect(work.body.data).toEqual({
        items: [{ kind: 'farmers_assigned', count: 2 }],
        farmersToMove: 2,
      });
      const blocked = await http
        .post(`/api/participants/${leaving}/revoke`)
        .auth(superToken, { type: 'bearer' })
        .send({ reason: 'resigned' })
        .expect(422);
      expect(blocked.body).toMatchObject({
        code: 'FIELD_OFFICER_HAS_FARMERS',
        details: { count: 2 },
      });
      await expect(access.farmerCountOf(uuidToBytes32(leaving))).resolves.toBe(
        2n,
      );

      await http
        .post(`/api/participants/${leaving}/revoke`)
        .auth(superToken, { type: 'bearer' })
        .send({ reason: 'resigned', replacementOfficerId: next })
        .expect(200);
      for (const f of farmers) {
        await expect(access.fieldOfficerOf(uuidToBytes32(f))).resolves.toBe(
          uuidToBytes32(next),
        );
        const row = await db.getRepository(User).findOneByOrFail({ id: f });
        expect(row.fieldOfficerId).toBe(next);
      }
      await expect(access.farmerCountOf(uuidToBytes32(leaving))).resolves.toBe(
        0n,
      );
      await expect(access.isVerified(uuidToBytes32(leaving))).resolves.toBe(
        false,
      );
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

  describe('password reset by SMS', () => {
    let outbox: MemorySmsSender['outbox'];
    let who: { phone: string; password: string; token: string };
    const ask = (phone: string) =>
      http.post('/api/auth/password-reset/request').send({ phone });
    const check = (phone: string, code: string) =>
      http.post('/api/auth/password-reset/verify').send({ phone, code });
    const complete = (phone: string, code: string, newPassword: string) =>
      http
        .post('/api/auth/password-reset/complete')
        .send({ phone, code, newPassword });
    /** The code in the newest text to this number. */
    const codeFor = (phone: string) => {
      const to = normalisePhone(phone)!;
      const sms = outbox.filter((m) => m.phone === to).at(-1);
      return /\b(\d{6})\b/.exec(sms?.text ?? '')?.[1] ?? '';
    };
    /** As if this number's codes were asked for `seconds` earlier. */
    const ago = (phone: string, seconds: number) =>
      db.query(
        `UPDATE verification_codes SET created_at = created_at - make_interval(secs => $2)
          WHERE target_index = $1`,
        [
          chain.app
            .get(PersonalDetailsCodec)
            .phoneIndex(normalisePhone(phone)!),
          seconds,
        ],
      );
    const wrong = (code: string) => (code === '000000' ? '111111' : '000000');

    beforeAll(async () => {
      outbox = (chain.app.get(SmsSender) as MemorySmsSender).outbox;
      const body = person(Role.INVESTOR);
      const res = await register(admin.token, body).expect(201);
      const token = await activate(body.phone, res.body.data.temporaryPassword);
      who = { phone: body.phone, password: `${body.phone}-real-pass`, token };
    });

    it('answers a registered and an unknown number alike, and texts only the registered one', async () => {
      const sent = outbox.length;
      const known = await ask(who.phone).expect(200);
      const unknown = await ask('01899999990').expect(200);
      expect(known.body.data).toEqual({
        resendAfterSeconds: 60,
        expiresInSeconds: 600,
      });
      expect(unknown.body.data).toEqual(known.body.data);
      await new Promise((r) => setTimeout(r, 50)); // the text goes out in the background
      expect(outbox.length).toBe(sent + 1);
      expect(outbox.at(-1)).toMatchObject({ phone: normalisePhone(who.phone) });
      expect(codeFor(who.phone)).toMatch(/^\d{6}$/);
    });

    it('makes you wait before another code, and the new code replaces the old', async () => {
      const first = codeFor(who.phone);
      const wait = await ask(who.phone).expect(429);
      expect(wait.body).toMatchObject({ code: 'CODE_WAIT' });
      expect(wait.body.details.seconds).toBeGreaterThan(0);
      expect(wait.body.details.seconds).toBeLessThanOrEqual(60);
      await ago(who.phone, 61);
      await ask(who.phone).expect(200);
      await new Promise((r) => setTimeout(r, 50));
      const second = codeFor(who.phone);
      if (first !== second) {
        expect((await check(who.phone, first).expect(422)).body.code).toBe(
          'CODE_WRONG',
        );
      }
      const ok = await check(who.phone, second).expect(200);
      expect(ok.body.data).toEqual({ valid: true });
    });

    it('counts wrong codes down and closes the code after five', async () => {
      await ago(who.phone, 61);
      await ask(who.phone).expect(200);
      await new Promise((r) => setTimeout(r, 50));
      const code = codeFor(who.phone);
      for (const left of [4, 3, 2, 1]) {
        const res = await check(who.phone, wrong(code)).expect(422);
        expect(res.body).toMatchObject({
          code: 'CODE_WRONG',
          details: { attemptsLeft: left },
        });
      }
      const last = await check(who.phone, wrong(code)).expect(422);
      expect(last.body.code).toBe('CODE_EXPIRED');
      // Closed: even the right code no longer works.
      expect((await check(who.phone, code).expect(422)).body.code).toBe(
        'CODE_EXPIRED',
      );
    });

    it('refuses a code past its ten minutes', async () => {
      await ago(who.phone, 61);
      await ask(who.phone).expect(200);
      await new Promise((r) => setTimeout(r, 50));
      await db.query(
        `UPDATE verification_codes SET expires_at = now() - interval '1 second' WHERE closed_at IS NULL`,
      );
      const res = await check(who.phone, codeFor(who.phone)).expect(422);
      expect(res.body.code).toBe('CODE_EXPIRED');
    });

    it('sets the new password, clears a lockout, ends other sessions and signs in', async () => {
      const before = await login(who.phone, who.password);
      await db.query(
        `UPDATE users SET failed_login_count = 5, locked_until = now() + interval '1 hour'
          WHERE phone_index = $1`,
        [
          chain.app
            .get(PersonalDetailsCodec)
            .phoneIndex(normalisePhone(who.phone)!),
        ],
      );
      await http
        .post('/api/auth/login')
        .send({ phone: who.phone, password: who.password })
        .expect(429);
      await ago(who.phone, 61);
      await ask(who.phone).expect(200);
      await new Promise((r) => setTimeout(r, 50));
      const code = codeFor(who.phone);

      // The same password again is refused, and the code stays usable.
      const same = await complete(who.phone, code, who.password).expect(422);
      expect(same.body.code).toBe('PASSWORD_UNCHANGED');

      const done = await complete(who.phone, code, 'a-new-reset-pass').expect(
        200,
      );
      expect(done.body.data).toMatchObject({
        tokenType: 'Bearer',
        mustChangePassword: false,
        user: { role: 'investor' },
      });
      expect(refreshCookie(done)).toMatch(/^wegro_rt=/);
      await http
        .post('/api/auth/refresh')
        .set('Cookie', before.cookie)
        .expect(401);
      await http
        .get('/api/auth/me')
        .auth(before.token, { type: 'bearer' })
        .expect(401);
      await login(who.phone, 'a-new-reset-pass');
      await http
        .post('/api/auth/login')
        .send({ phone: who.phone, password: who.password })
        .expect(401);
      // Used up.
      expect((await check(who.phone, code).expect(422)).body.code).toBe(
        'CODE_EXPIRED',
      );
    });

    it('texts in the person’s own language', async () => {
      const { token } = await login(who.phone, 'a-new-reset-pass');
      await http
        .patch('/api/auth/me')
        .auth(token, { type: 'bearer' })
        .send({ language: 'bn' })
        .expect(200);
      // Past the hourly limit the earlier tests used up.
      await ago(who.phone, 3600);
      await ask(who.phone).expect(200);
      await new Promise((r) => setTimeout(r, 50));
      const to = normalisePhone(who.phone);
      expect(outbox.filter((m) => m.phone === to).at(-1)?.text).toMatch(
        /^WeGro: পাসওয়ার্ড বদলানোর কোড \d{6}। ১০ মিনিট/,
      );
    });

    it('allows five codes an hour per number, registered or not', async () => {
      const stranger = '01899999991';
      for (let i = 0; i < 5; i++) {
        await ask(stranger).expect(200);
        await ago(stranger, 61);
      }
      const res = await ask(stranger).expect(429);
      expect(res.body).toMatchObject({ code: 'CODE_TOO_MANY' });
      expect(res.body.details.minutes).toBeGreaterThan(0);
    });

    it('refuses malformed numbers and codes', async () => {
      expect((await ask('12345').expect(422)).body.code).toBe('PHONE_INVALID');
      const bad = await check(who.phone, '12ab56').expect(400);
      expect(bad.body.code).toBe('INVALID_INPUT');
    });
  });

  describe('changing one’s own details', () => {
    let outbox: MemorySmsSender['outbox'];
    let me: {
      id: string;
      token: string;
      password: string;
      body: ReturnType<typeof person>;
    };
    let oldPhone: string;
    const as = (token: string) => ({
      get: (path: string) =>
        http.get(`/api${path}`).auth(token, { type: 'bearer' }),
      post: (path: string, body: object = {}) =>
        http.post(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
      delete: (path: string) =>
        http.delete(`/api${path}`).auth(token, { type: 'bearer' }),
    });
    /** Every detail, as the form sends them. */
    const details = (
      over: Partial<ReturnType<typeof person>> & { phoneCode?: string } = {},
    ) => {
      const { role: _role, ...rest } = { ...me.body, ...over };
      return rest;
    };
    const codeFor = (phone: string) => {
      const to = normalisePhone(phone)!;
      const sms = outbox.filter((m) => m.phone === to).at(-1);
      return /\b(\d{6})\b/.exec(sms?.text ?? '')?.[1] ?? '';
    };
    const wrong = (code: string) => (code === '000000' ? '111111' : '000000');
    const ledgerHash = async (id: string) =>
      (await contracts.get('AccessRegistry').getParticipant(uuidToBytes32(id)))
        .detailsHash as string;

    beforeAll(async () => {
      outbox = (chain.app.get(SmsSender) as MemorySmsSender).outbox;
      const body = person(Role.INVESTOR);
      const res = await register(admin.token, body).expect(201);
      const token = await activate(body.phone, res.body.data.temporaryPassword);
      me = {
        id: res.body.data.participant.id,
        token,
        password: `${body.phone}-real-pass`,
        body,
      };
      oldPhone = body.phone;
    });

    it('shows my own details in full, and asks for a change only when something differs', async () => {
      const mine = await as(me.token).get('/me/details').expect(200);
      expect(mine.body.data).toMatchObject({
        current: {
          fullName: me.body.fullName,
          phone: normalisePhone(me.body.phone),
          nid: me.body.nid,
          district: 'BOGURA',
        },
        change: null,
        needsApproval: true,
      });
      const same = await as(me.token)
        .post('/me/details/change', details())
        .expect(422);
      expect(same.body.code).toBe('DETAILS_UNCHANGED');
    });

    it('waits for an admin, keeping the current details and the ledger as they are', async () => {
      const before = await ledgerHash(me.id);
      const res = await as(me.token)
        .post(
          '/me/details/change',
          details({ address: 'New made-up address, Bogura' }),
        )
        .expect(200);
      expect(res.body.data.change).toMatchObject({
        status: 'pending',
        changedFields: ['address'],
        requested: { address: 'New made-up address, Bogura' },
      });
      expect(res.body.data.current.address).toBe(me.body.address);
      expect(await ledgerHash(me.id)).toBe(before);
      await new Promise((r) => setTimeout(r, 50));
      const inbox = await as(admin.token)
        .get('/notifications?limit=100')
        .expect(200);
      expect(
        inbox.body.data.items.some(
          (n: { kind: string }) => n.kind === 'details.change-requested',
        ),
      ).toBe(true);
    });

    it('needs a new number confirmed by a code sent to it', async () => {
      const newPhone = nextPhone();
      const noCode = await as(me.token)
        .post('/me/details/change', details({ phone: newPhone }))
        .expect(422);
      expect(noCode.body.code).toBe('PHONE_NOT_CONFIRMED');
      expect(
        (
          await as(me.token)
            .post('/me/details/phone-code', { phone: me.body.phone })
            .expect(422)
        ).body.code,
      ).toBe('PHONE_UNCHANGED');
      expect(
        (
          await as(me.token)
            .post('/me/details/phone-code', { phone: admin.phone })
            .expect(409)
        ).body.code,
      ).toBe('PHONE_ALREADY_REGISTERED');

      await as(me.token)
        .post('/me/details/phone-code', { phone: newPhone })
        .expect(200);
      await new Promise((r) => setTimeout(r, 50));
      const code = codeFor(newPhone);
      expect(code).toMatch(/^\d{6}$/);
      const bad = await as(me.token)
        .post(
          '/me/details/change',
          details({ phone: newPhone, phoneCode: wrong(code) }),
        )
        .expect(422);
      expect(bad.body).toMatchObject({
        code: 'CODE_WRONG',
        details: { attemptsLeft: 4 },
      });

      // A new request replaces the one waiting.
      const res = await as(me.token)
        .post(
          '/me/details/change',
          details({
            phone: newPhone,
            address: 'New made-up address, Bogura',
            phoneCode: code,
          }),
        )
        .expect(200);
      expect(res.body.data.change).toMatchObject({
        status: 'pending',
        changedFields: ['phone', 'address'],
      });
      me.body = {
        ...me.body,
        phone: newPhone,
        address: 'New made-up address, Bogura',
      };
      const pending = await db.query(
        `SELECT status FROM detail_change_requests WHERE user_id = $1 ORDER BY created_at`,
        [me.id],
      );
      expect(pending.map((r: { status: string }) => r.status)).toEqual([
        'withdrawn',
        'pending',
      ]);
    });

    it('is approved by an admin: the ledger records it, the new number signs in', async () => {
      const list = await as(admin.token).get('/detail-changes').expect(200);
      const row = list.body.data.find(
        (c: { participant: { id: string } }) => c.participant.id === me.id,
      );
      expect(row).toMatchObject({
        role: 'investor',
        changedFields: ['phone', 'address'],
      });
      // Staff changes are the super admin's; this one is not on their list.
      const staffList = await as(superToken).get('/detail-changes').expect(200);
      expect(
        staffList.body.data.some(
          (c: { participant: { id: string } }) => c.participant.id === me.id,
        ),
      ).toBe(false);

      const review = await as(admin.token)
        .get(`/detail-changes/${row.id}`)
        .expect(200);
      expect(review.body.data.current.phone).not.toBe(
        review.body.data.requested.phone,
      );

      const done = await as(admin.token)
        .post(`/detail-changes/${row.id}/approve`)
        .expect(200);
      expect(done.body.data).toMatchObject({
        status: 'approved',
        decidedBy: { id: admin.id },
        current: { phone: normalisePhone(me.body.phone) },
      });
      const integrity = await as(admin.token)
        .get(`/participants/${me.id}/integrity`)
        .expect(200);
      expect(integrity.body.data).toMatchObject({
        matches: true,
        mismatches: [],
      });
      expect(await ledgerHash(me.id)).toBe(integrity.body.data.computedHash);

      // The new number signs in with the same password; the old one no longer does.
      me.token = (await login(me.body.phone, me.password)).token;
      await http
        .post('/api/auth/login')
        .send({ phone: oldPhone, password: me.password })
        .expect(401);
      const mine = await as(me.token).get('/me/details').expect(200);
      expect(mine.body.data).toMatchObject({
        current: {
          phone: normalisePhone(me.body.phone),
          address: 'New made-up address, Bogura',
        },
        change: { status: 'approved' },
      });
      await new Promise((r) => setTimeout(r, 50));
      const inbox = await as(me.token)
        .get('/notifications?limit=100')
        .expect(200);
      expect(
        inbox.body.data.items.some(
          (n: { kind: string }) => n.kind === 'details.change-approved',
        ),
      ).toBe(true);
    });

    it('can be rejected with a reason, or withdrawn', async () => {
      await as(me.token)
        .post(
          '/me/details/change',
          details({ address: 'Another made-up address, Bogura' }),
        )
        .expect(200);
      const [{ id }] = await db.query(
        `SELECT id FROM detail_change_requests WHERE user_id = $1 AND status = 'pending'`,
        [me.id],
      );
      const rejected = await as(admin.token)
        .post(`/detail-changes/${id}/reject`, {
          reason: 'Please send the NID photo first',
        })
        .expect(200);
      expect(rejected.body.data).toMatchObject({
        status: 'rejected',
        reason: 'Please send the NID photo first',
      });
      const mine = await as(me.token).get('/me/details').expect(200);
      expect(mine.body.data.change).toMatchObject({
        status: 'rejected',
        reason: 'Please send the NID photo first',
      });
      const again = await as(admin.token)
        .post(`/detail-changes/${id}/approve`)
        .expect(409);
      expect(again.body).toMatchObject({
        code: 'CHANGE_NOT_PENDING',
        details: { status: 'rejected' },
      });

      await as(me.token)
        .post(
          '/me/details/change',
          details({ address: 'Third made-up address, Bogura' }),
        )
        .expect(200);
      const withdrawn = await as(me.token)
        .delete('/me/details/change')
        .expect(200);
      expect(withdrawn.body.data.change.status).toBe('withdrawn');
      expect(
        (await as(me.token).delete('/me/details/change').expect(404)).body.code,
      ).toBe('CHANGE_NOT_FOUND');
    });

    it('refuses an NID someone else already has', async () => {
      const res = await as(me.token)
        .post('/me/details/change', details({ nid: farmer.nid }))
        .expect(409);
      expect(res.body.code).toBe('NID_ALREADY_REGISTERED');
    });

    it('leaves staff changes to the super admin, whose own apply at once', async () => {
      await as(admin.token)
        .post('/me/details/change', {
          fullName: 'Test Admin Renamed',
          phone: admin.phone,
          nid: (await as(admin.token).get('/me/details').expect(200)).body.data
            .current.nid,
          dateOfBirth: '1988-03-21',
          district: 'BOGURA',
          address: 'Made-up test address, Bogura',
        })
        .expect(200);
      const [{ id }] = await db.query(
        `SELECT id FROM detail_change_requests WHERE user_id = $1 AND status = 'pending'`,
        [admin.id],
      );
      // An admin is staff: only the super admin decides.
      expect(
        (
          await as(admin.token)
            .post(`/detail-changes/${id}/approve`)
            .expect(403)
        ).body.code,
      ).toBe('STAFF_MANAGED_BY_SUPER_ADMIN');
      await as(superToken).post(`/detail-changes/${id}/approve`).expect(200);
      expect(
        (await as(admin.token).get('/me/details').expect(200)).body.data.current
          .fullName,
      ).toBe('Test Admin Renamed');

      const own = await as(superToken)
        .post('/me/details/change', {
          fullName: 'Test Super Admin Renamed',
          phone: SUPER_PHONE,
        })
        .expect(200);
      expect(own.body.data).toMatchObject({
        needsApproval: false,
        change: null,
        current: { fullName: 'Test Super Admin Renamed' },
      });
    });
  });

  describe('registration as of item 9', () => {
    const sent = () => (chain.app.get(SmsSender) as MemorySmsSender).outbox;
    const smsTo = (phone: string) =>
      sent()
        .filter((m) => m.phone === normalisePhone(phone))
        .at(-1)?.text ?? '';
    const codeIn = (text: string) => /\b(\d{6})\b/.exec(text)?.[1] ?? '';
    const as = (token: string) => ({
      get: (path: string) =>
        http.get(`/api${path}`).auth(token, { type: 'bearer' }),
      post: (path: string, body: object = {}) =>
        http.post(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
      delete: (path: string) =>
        http.delete(`/api${path}`).auth(token, { type: 'bearer' }),
    });

    it('lets field officers register farmers only', async () => {
      for (const role of [Role.INVESTOR, Role.SUPPLIER, Role.BUYER]) {
        const res = await register(officer.token, person(role)).expect(403);
        expect(res.body.code).toBe('FIELD_OFFICER_FARMERS_ONLY');
      }
    });

    it('checks a registration without saving it, worded by reason', async () => {
      const body = person(Role.INVESTOR, {
        nid: `1988${'26'}${String(randomInt(1e10, 1e11))}`,
      });
      const res = await as(admin.token)
        .post('/participants/check', body)
        .expect(200);
      expect(res.body.data).toMatchObject({
        outcome: 'flagged',
        phoneTaken: false,
        nidTaken: false,
      });
      expect(res.body.data.checks).toContainEqual(
        expect.objectContaining({
          code: 'NID_DISTRICT',
          result: 'warn',
          reason: 'NID_DISTRICT_DIFFERENT',
          params: { issued: 'DHAKA', given: 'BOGURA' },
        }),
      );
      const [{ n }] = await db.query(
        `SELECT count(*)::int AS n FROM users u JOIN personal_details d ON d.user_id = u.id WHERE u.phone_index = $1`,
        [
          chain.app
            .get(PersonalDetailsCodec)
            .phoneIndex(normalisePhone(body.phone)!),
        ],
      );
      expect(n).toBe(0);

      // Taken details and failed rules, all at once.
      const taken = await as(admin.token)
        .post('/participants/check', {
          ...person(Role.FARMER),
          phone: admin.phone,
          nid: farmer.nid,
          dateOfBirth: '2015-01-01',
        })
        .expect(200);
      expect(taken.body.data).toMatchObject({
        outcome: 'failed',
        phoneTaken: true,
        nidTaken: true,
      });
      expect(
        taken.body.data.checks.filter(
          (c: { result: string }) => c.result === 'fail',
        ),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ reason: 'AGE_UNDER', params: { min: 18 } }),
        ]),
      );
      // A field officer may check farmers only, as they register.
      await as(officer.token)
        .post('/participants/check', person(Role.BUYER))
        .expect(403);
    });

    it('texts the temporary password in the language chosen for them', async () => {
      const body = { ...person(Role.BUYER), language: 'bn' };
      const res = await register(admin.token, body as never).expect(201);
      const { temporaryPassword, smsSent, participant } = res.body.data;
      expect(smsSent).toBe(true);
      expect(smsTo(body.phone)).toContain(temporaryPassword);
      expect(smsTo(body.phone)).toContain('অস্থায়ী পাসওয়ার্ড');
      const first = await login(body.phone, temporaryPassword);
      expect(first.mustChange).toBe(true);

      // A reset is texted too, ending the sessions it had.
      const reset = await as(admin.token)
        .post(`/participants/${participant.id}/reset-password`)
        .expect(200);
      expect(reset.body.data.smsSent).toBe(true);
      expect(smsTo(body.phone)).toContain(reset.body.data.temporaryPassword);
    });

    it('finds people by whole words of their name, their number or NID', async () => {
      const body = person(Role.BUYER, { fullName: 'Shapla Khatun Mondal' });
      const id = (await register(admin.token, body).expect(201)).body.data
        .participant.id;
      const found = async (q: string) =>
        (
          await as(admin.token)
            .get(`/participants?q=${encodeURIComponent(q)}&limit=100`)
            .expect(200)
        ).body.data.map((p: { id: string }) => p.id) as string[];
      expect(await found('khatun')).toContain(id);
      expect(await found('MONDAL  shapla')).toContain(id);
      expect(await found(body.phone)).toEqual([id]);
      expect(await found(body.nid)).toEqual([id]);
      // Every word must be in the name; a part of a word is not a word.
      expect(await found('shapla rahim')).not.toContain(id);
      expect(await found('khat')).not.toContain(id);

      // A name changed by an approved request is found by its new words.
      const staff = await as(superToken)
        .get('/participants?q=renamed&limit=100')
        .expect(200);
      expect(staff.body.data.map((p: { id: string }) => p.id)).toContain(
        admin.id,
      );
    });

    it('lists as waiting only the people the caller may verify', async () => {
      const staff = await register(superToken, person(Role.AUDITOR)).expect(
        201,
      );
      const other = await register(admin.token, person(Role.BUYER)).expect(201);
      const waiting = async (token: string) =>
        (
          await as(token)
            .get('/participants?status=pending&manageable=true&limit=100')
            .expect(200)
        ).body.data.map((p: { id: string }) => p.id) as string[];
      const byAdmin = await waiting(admin.token);
      expect(byAdmin).toContain(other.body.data.participant.id);
      expect(byAdmin).not.toContain(staff.body.data.participant.id);
      const bySuper = await waiting(superToken);
      expect(bySuper).toContain(staff.body.data.participant.id);
      expect(bySuper).not.toContain(other.body.data.participant.id);
    });

    it('finds details-change requests by whose they are', async () => {
      const body = person(Role.INVESTOR, { fullName: 'Kohinoor Begum' });
      const res = await register(admin.token, body).expect(201);
      const token = await activate(body.phone, res.body.data.temporaryPassword);
      const { role: _role, ...details } = body;
      await as(token)
        .post('/me/details/change', {
          ...details,
          address: 'House 3, Road 8, Sherpur, Bogura',
        })
        .expect(200);
      const list = async (q: string) =>
        (
          await as(admin.token)
            .get(`/detail-changes?q=${encodeURIComponent(q)}`)
            .expect(200)
        ).body.data.map(
          (c: { participant: { id: string } }) => c.participant.id,
        );
      expect(await list('kohinoor')).toEqual([res.body.data.participant.id]);
      expect(await list(body.phone)).toEqual([res.body.data.participant.id]);
      expect(await list('nobody-by-this-name')).toEqual([]);
    });

    it('names the registrar and the field officer on the detail', async () => {
      const res = await as(admin.token)
        .get(`/participants/${farmer.id}`)
        .expect(200);
      expect(res.body.data).toMatchObject({
        selfRegistered: false,
        registeredBy: { id: officer.id, name: 'Test field officer' },
        // Reassigned to another officer earlier on.
        fieldOfficer: { id: expect.any(String), name: 'Test field officer' },
        email: null,
      });
    });

    describe('signing up', () => {
      const me = person(Role.INVESTOR);
      const password = 'my-own-password-1';
      let id: string;
      let token: string;

      it('sends a code only to a number not yet registered', async () => {
        const taken = await http
          .post('/api/auth/sign-up/code')
          .send({ phone: admin.phone })
          .expect(409);
        expect(taken.body.code).toBe('PHONE_ALREADY_REGISTERED');
        await http
          .post('/api/auth/sign-up/code')
          .send({ phone: me.phone, language: 'en' })
          .expect(200);
        expect(smsTo(me.phone)).toMatch(/your sign-up code is \d{6}/);
      });

      it('refuses other roles, a wrong code and a failed ID check', async () => {
        const { role: _role, ...details } = me;
        const base = { ...details, password };
        await http
          .post('/api/auth/sign-up')
          .send({ ...base, role: 'farmer', phoneCode: '123456' })
          .expect(400);
        const code = codeIn(smsTo(me.phone));
        const wrong = await http
          .post('/api/auth/sign-up')
          .send({
            ...base,
            role: 'investor',
            phoneCode: code === '000000' ? '111111' : '000000',
          })
          .expect(422);
        expect(wrong.body).toMatchObject({
          code: 'CODE_WRONG',
          details: { attemptsLeft: 4 },
        });
        const failed = await http
          .post('/api/auth/sign-up')
          .send({ ...base, role: 'investor', phoneCode: code, address: 'x' })
          .expect(422);
        expect(failed.body.code).toBe('ID_CHECK_FAILED');
      });

      it('registers and verifies them on the ledger, and signs them in', async () => {
        const { role: _role, ...details } = me;
        const res = await http
          .post('/api/auth/sign-up')
          .send({
            ...details,
            role: 'investor',
            password,
            language: 'bn',
            phoneCode: codeIn(smsTo(me.phone)),
          })
          .expect(201);
        expect(res.headers['set-cookie'][0]).toMatch(/^wegro_rt=/);
        expect(res.body.data).toMatchObject({
          mustChangePassword: false,
          user: { role: 'investor', status: 'verified', language: 'bn' },
        });
        id = res.body.data.user.id;
        token = res.body.data.accessToken;
        await expect(
          contracts
            .get('AccessRegistry')
            .isVerifiedAs(uuidToBytes32(id), CHAIN_ROLE[Role.INVESTOR]),
        ).resolves.toBe(true);
        const detail = await as(admin.token)
          .get(`/participants/${id}`)
          .expect(200);
        expect(detail.body.data).toMatchObject({
          selfRegistered: true,
          registeredBy: null,
          chainState: 'confirmed',
          status: 'verified',
        });
        const integrity = await as(admin.token)
          .get(`/participants/${id}/integrity`)
          .expect(200);
        expect(integrity.body.data.matches).toBe(true);
        // The code is used up; their own password signs in.
        await login(me.phone, password);
      });

      it('confirms an email address by code, which then signs in', async () => {
        const outbox = (chain.app.get(EmailSender) as MemoryEmailSender).outbox;
        const address = `Investor.${phoneSeq}@Example.com`;
        await as(token)
          .post('/auth/me/email/code', { email: 'nope' })
          .expect(400);
        await as(token)
          .post('/auth/me/email/code', { email: address })
          .expect(200);
        const mail = outbox.at(-1)!;
        expect(mail.to).toBe(address.toLowerCase());
        const code = codeIn(mail.text);

        const wrong = await as(token)
          .post('/auth/me/email', {
            email: address,
            code: code === '000000' ? '111111' : '000000',
          })
          .expect(422);
        expect(wrong.body.code).toBe('CODE_WRONG');
        const saved = await as(token)
          .post('/auth/me/email', { email: address, code })
          .expect(200);
        expect(saved.body.data.email).toBe(address.toLowerCase());

        const byEmail = await http
          .post('/api/auth/login')
          .send({ email: ` ${address.toUpperCase()} `, password })
          .expect(200);
        expect(byEmail.body.data.user.id).toBe(id);

        // Nobody else may take it; it is theirs already.
        await as(admin.token)
          .post('/auth/me/email/code', { email: address })
          .expect(409);
        const same = await as(token)
          .post('/auth/me/email/code', { email: address })
          .expect(422);
        expect(same.body.code).toBe('EMAIL_UNCHANGED');
        const shown = await as(admin.token)
          .get(`/participants/${id}`)
          .expect(200);
        expect(shown.body.data.email).toBe(address.toLowerCase());

        // Taken off, it no longer signs in.
        const removed = await as(token).delete('/auth/me/email').expect(200);
        expect(removed.body.data.email).toBeNull();
        await http
          .post('/api/auth/login')
          .send({ email: address, password })
          .expect(401);
        expect(
          (await as(token).delete('/auth/me/email').expect(404)).body.code,
        ).toBe('EMAIL_NOT_SET');
      });
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
        .countBy({ chainState: ChainState.CONFIRMED });
      expect(midway).toBe(0);
      await indexer.catchUp();

      expect(await snapshot()).toEqual(before);
    });

    it('agrees with the contracts on every role id', async () => {
      const access = contracts.get('AccessRegistry');
      await expect(access.FARMER_ROLE()).resolves.toBe(CHAIN_ROLE[Role.FARMER]);
      await expect(access.OPERATIONS_ROLE()).resolves.toBe(
        CHAIN_ROLE[Role.OPERATIONS],
      );
      await expect(access.AUDITOR_ROLE()).resolves.toBe(
        CHAIN_ROLE[Role.AUDITOR],
      );
    });
  });
});

function refreshCookie(res: request.Response): string {
  const header = res.headers['set-cookie'] as unknown as string[];
  return header[0].split(';')[0];
}
