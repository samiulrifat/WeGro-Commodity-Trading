/** Demo mode against the local chain: one verified, ready-made account per role. */
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ContractsRegistry } from '../src/blockchain/contracts.registry';
import { uuidToBytes32 } from '../src/blockchain/utils/ids';
import { DemoAccountsService } from '../src/modules/participants/demo-accounts.service';
import { User } from '../src/modules/users/entities/user.entity';
import {
  CHAIN_ROLE,
  PARTICIPANT_ROLES,
  Role,
} from '../src/modules/users/roles';
import {
  type ChainApp,
  startChainApp,
  waitForDemoAccounts,
} from './support/chain-app';

const ALL_ROLES = Object.values(Role);

describe('Demo mode (node + database)', () => {
  let chain: ChainApp;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    chain = await startChainApp({ DEMO_MODE: 'true' });
    http = request(chain.app.getHttpServer());

    await waitForDemoAccounts(chain);
  });

  afterAll(async () => {
    await chain?.close();
  });

  it('lists one demo account per role', async () => {
    const res = await http.get('/api/auth/demo/accounts').expect(200);
    expect(res.body.data.map((a: { role: string }) => a.role).sort()).toEqual(
      [...ALL_ROLES].sort(),
    );
  });

  it.each(ALL_ROLES)(
    'signs in as the demo %s without a password',
    async (role) => {
      const res = await http
        .post('/api/auth/demo/login')
        .send({ role })
        .expect(200);
      expect(res.body.data).toMatchObject({
        mustChangePassword: false,
        user: { role, status: 'verified' },
      });
      const me = await http
        .get('/api/auth/me')
        .auth(res.body.data.accessToken, { type: 'bearer' })
        .expect(200);
      expect(me.body.data).toMatchObject({ role, isDemo: true });
    },
  );

  it('has every demo participant verified on-chain, the farmer with the demo officer', async () => {
    const access = chain.app.get(ContractsRegistry).get('AccessRegistry');
    const users = chain.app.get(DataSource).getRepository(User);
    for (const role of PARTICIPANT_ROLES) {
      const user = await users.findOneByOrFail({ role, isDemo: true });
      await expect(
        access.isVerifiedAs(uuidToBytes32(user.id), CHAIN_ROLE[role]),
      ).resolves.toBe(true);
    }
    const farmer = await users.findOneByOrFail({
      role: Role.FARMER,
      isDemo: true,
    });
    const officer = await users.findOneByOrFail({
      role: Role.FIELD_OFFICER,
      isDemo: true,
    });
    expect(farmer.fieldOfficerId).toBe(officer.id);
  });

  it('demo accounts cannot sign in with a password', async () => {
    await http
      .post('/api/auth/login')
      .send({ phone: '01700000001', password: 'any-password-at-all' })
      .expect(401);
  });

  it('is idempotent: running the setup again changes nothing', async () => {
    const users = chain.app.get(DataSource).getRepository(User);
    const before = await users.find({ order: { id: 'ASC' } });
    await chain.app.get(DemoAccountsService).ensureAll();
    const after = await users.find({ order: { id: 'ASC' } });
    expect(after.map((u) => [u.id, u.status, u.keyIndex])).toEqual(
      before.map((u) => [u.id, u.status, u.keyIndex]),
    );
  });
});
