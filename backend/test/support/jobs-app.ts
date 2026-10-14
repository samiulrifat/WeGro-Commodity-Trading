/** Shared setup for the jobs suites: one app per test file. */
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ContractsRegistry } from '../../src/blockchain/contracts.registry';
import { User } from '../../src/modules/users/entities/user.entity';
import { Role } from '../../src/modules/users/roles';
import { demoToken, startChainApp, waitForDemoAccounts } from './chain-app';

const RUN = randomBytes(4).toString('hex').toUpperCase();

/** One app's handles, with helpers bound to it. */
export async function boot(env: Record<string, string>) {
  const chain = await startChainApp({ DEMO_MODE: 'true', ...env });
  const http = request(chain.app.getHttpServer());
  await waitForDemoAccounts(chain);
  const t: Record<string, string> = {};
  for (const r of [
    Role.SuperAdmin,
    Role.Admin,
    Role.Accounts,
    Role.Auditor,
    Role.Investor,
  ]) {
    t[r] = await demoToken(http, r);
  }
  const farmer = await chain.app
    .get(DataSource)
    .getRepository(User)
    .findOneByOrFail({ role: Role.Farmer, isDemo: true });
  const as = (token: string) => ({
    get: (path: string) =>
      http.get(`/api${path}`).auth(token, { type: 'bearer' }),
    post: (path: string, body: object = {}) =>
      http.post(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
  });
  /** A published project with one unpaid reservation; returns its id. */
  const unpaidReservation = async (name: string) => {
    const project = (
      await as(t.admin)
        .post('/projects', {
          title: `${name} ${RUN}`,
          produceCode: 'MAIZE',
          districtCode: 'BOGURA',
          location: 'Shibganj',
          farmerId: farmer.id,
          durationType: 'short_term',
          durationMonths: 5,
          fundingTarget: '50000',
          slotPrice: '10000',
          estimatedReturnMinBps: 0,
          estimatedReturnMaxBps: 1000,
        })
        .expect(201)
    ).body.data.id;
    await as(t.admin).post(`/projects/${project}/publish`).expect(200);
    return (
      await as(t.investor)
        .post(`/projects/${project}/reservations`, { slots: 1 })
        .expect(201)
    ).body.data.id as number;
  };
  const travel = async (seconds: number) => {
    const provider = chain.app.get(ContractsRegistry).provider;
    await provider.send('evm_increaseTime', [seconds]);
    await provider.send('evm_mine', []);
    await new Promise((r) => setTimeout(r, 1100)); // the app's chain clock caches for a second
  };
  return { chain, t, as, unpaidReservation, travel };
}
