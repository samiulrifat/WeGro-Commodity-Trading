import type { Page } from '@playwright/test';
import { expect, pagesOf, ROLES, signInAs, SUPER_ADMIN, test } from './support';

/**
 * NFR-4: pages open in under 2 seconds. Timed on the production build with
 * `npm run e2e:speed` (skipped in `npm run e2e`): the dev server compiles
 * each file on request and says nothing about speed.
 * On the phone project the network is slowed to a 4G connection as in
 * Bangladesh outside the cities (150 ms round trips, 1.6 Mbit/s down) and
 * the processor 4 times, as on a low-cost phone.
 */
const LIMIT_MS = 2000;

/** Slows the page down as a low-cost phone on 4G, on the phone project. */
async function slowDown(page: Page, phone: boolean) {
  if (!phone) return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

/**
 * Milliseconds from the start until the page is ready to use: its heading
 * shown, nothing still loading and no API call waiting for an answer.
 */
async function settled(page: Page, pending: Set<unknown>, start: number) {
  for (;;) {
    const ready =
      pending.size === 0 &&
      (await page.evaluate(() => {
        const main = document.querySelector('main');
        // textContent, not innerText: checking must not lay the page out.
        return (
          !!main?.querySelector('h1') && !main.textContent?.includes('Loading…')
        );
      }));
    if (ready) return Date.now() - start;
    if (Date.now() - start > 15_000) return Infinity;
    await page.waitForTimeout(25);
  }
}

for (const role of ROLES) {
  test(`${role}: every page opens in under 2 seconds`, async ({
    page,
    errors,
  }, info) => {
    void errors;
    test.skip(!process.env.E2E_SPEED, 'Timed by npm run e2e:speed');
    test.skip(
      role === 'super_admin' && !SUPER_ADMIN.password,
      'Set E2E_SUPER_ADMIN_PASSWORD to include the super admin',
    );
    const pending = new Set<unknown>();
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.startsWith('/api/')) pending.add(r);
    });
    page.on('requestfinished', (r) => pending.delete(r));
    page.on('requestfailed', (r) => pending.delete(r));

    await signInAs(page, role);
    // As on any later visit, the app's files are kept on the device.
    await page.evaluate(() =>
      navigator.serviceWorker.ready.then(() => undefined),
    );
    await slowDown(page, info.project.name === 'phone');

    const times: string[] = [];
    const slow: string[] = [];
    // First the app from nothing (a reload: files from the cache, as on a
    // second visit), then each menu page as a person moves between them.
    let start = Date.now();
    await page.reload();
    let ms = await settled(page, pending, start);
    times.push(`reload ${new URL(page.url()).pathname}: ${ms} ms`);
    if (ms > LIMIT_MS) slow.push(times.at(-1)!);
    for (const path of pagesOf(role)) {
      start = Date.now();
      await page.evaluate((to) => {
        history.pushState({}, '', to);
        dispatchEvent(new PopStateEvent('popstate'));
      }, path);
      ms = await settled(page, pending, start);
      times.push(`${path}: ${ms} ms`);
      if (ms > LIMIT_MS) slow.push(times.at(-1)!);
    }
    await info.attach('times', { body: times.join('\n') });
    expect(slow).toEqual([]);
  });
}
