import { deflateSync } from 'node:zlib';
import { expect, type Page, test as base } from '@playwright/test';
import { AREAS, NAV } from '../src/app/navigation';

/** Roles with a demo account (DEMO_MODE on the backend). */
export type Role =
  | 'super_admin'
  | 'admin'
  | 'operations'
  | 'accounts'
  | 'auditor'
  | 'field_officer'
  | 'farmer'
  | 'investor'
  | 'buyer'
  | 'seller'
  | 'supplier'
  | 'warehouse'
  | 'insurer'
  | 'bank';

/** How each demo account's button reads (its role, in English). */
const ROLE_NAMES: Record<Role, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  operations: 'Operations',
  accounts: 'Accounts',
  auditor: 'Auditor',
  field_officer: 'Field Officer',
  farmer: 'Farmer',
  investor: 'Investor',
  buyer: 'Buyer',
  seller: 'Seller',
  supplier: 'Supplier',
  warehouse: 'Warehouse Operator',
  insurer: 'Insurer',
  bank: 'Bank',
};

/**
 * The super admin is not a demo account: their phone and password, as given
 * to `npm run data:reset`, come from the environment (never the repo).
 */
export const SUPER_ADMIN = {
  phone: process.env.E2E_SUPER_ADMIN_PHONE ?? '01711000000',
  password: process.env.E2E_SUPER_ADMIN_PASSWORD,
};

/** Sign-ins are limited to 10 a minute: at least this long between them. */
const SIGN_IN_GAP_MS = 6500;
let lastSignIn = 0;

/**
 * Signs in as a role's demo account through the sign-in page, as a person
 * would, pacing sign-ins under the limit and waiting out a refusal. Ends in
 * `lang` (English unless asked): the choice is saved to the account, so an
 * earlier run may have left it in Bengali.
 */
export async function signInAs(
  page: Page,
  role: Role,
  lang: 'en' | 'bn' = 'en',
): Promise<void> {
  const name = ROLE_NAMES[role];
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = lastSignIn + SIGN_IN_GAP_MS - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
    lastSignIn = Date.now();
    await page.goto('/sign-in');
    if (role === 'super_admin') {
      // Not a demo account: signs in with the phone and password set at reset.
      await page.locator('#sign-in-phone').fill(SUPER_ADMIN.phone);
      await page.locator('#sign-in-password').fill(SUPER_ADMIN.password!);
      await page.locator('#sign-in-password').press('Enter');
    } else {
      await page.getByRole('tab', { name: 'Demo' }).click();
      await page
        .getByRole('button', { name: new RegExp(`^${name}\\b`) })
        .first()
        .click();
    }
    // Signed in, refused for going too fast, or no answer in time: the
    // last two wait and try again.
    const outcome = await Promise.race([
      page
        .waitForURL((u) => !u.pathname.startsWith('/sign-in'), {
          timeout: 20_000,
        })
        .then(() => 'in' as const),
      page
        .getByText(/Too many|অনেকবার/)
        .first()
        .waitFor({ timeout: 20_000 })
        .then(() => 'limited' as const),
    ]).catch(() => 'stalled' as const);
    if (outcome === 'in') {
      await expect(page.locator('main')).toBeVisible();
      await switchLanguage(page, lang);
      return;
    }
    await page.waitForTimeout(30_000);
  }
  throw new Error(`Could not sign in as ${role}`);
}

/** Signs out through the account menu, as a person would. */
export async function signOut(page: Page) {
  await page.getByRole('button', { name: /^Account/ }).click();
  await page.getByRole('menuitem', { name: 'Sign Out' }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/sign-in'));
}

/** A plain green photo, as a phone would send (a real PNG the app can shrink). */
export function photo(name = 'photo.png', size = 64) {
  const chunk = (type: string, data: Buffer) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.alloc(size * 3, Buffer.from([0x43, 0x6d, 0x08])),
  ]);
  const buffer = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array(size).fill(row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return { name, mimeType: 'image/png', buffer };
}

function crc32(bytes: Buffer): number {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

/** A short tag that keeps each run's records apart in the shared data. */
export const RUN = Date.now().toString(36).toUpperCase();

/**
 * Puts the app in `lang` with the switch in the top bar. The pressed button
 * follows the account at once, while the page changes once the words load:
 * so press it only if it is not pressed, then wait for the page.
 */
export async function switchLanguage(page: Page, lang: 'en' | 'bn') {
  const button = page
    .getByRole('button', { name: lang === 'bn' ? /^বাংলা$/ : /^EN\b/ })
    .first();
  if ((await button.getAttribute('aria-pressed')) !== 'true')
    await button.click();
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

/** Navigates inside the app without reloading (the session lives in memory). */
export async function go(page: Page, path: string) {
  await page.evaluate((to) => {
    history.pushState({}, '', to);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await page.waitForLoadState('networkidle');
}

/** Every page in a role's menu: each section's pages, or the section itself. */
export function pagesOf(role: Role): string[] {
  return NAV[role].flatMap((item) =>
    item.pages ? item.pages.map((p) => p.to) : [AREAS[item.area].to],
  );
}

/** Every role, for sweeps that read the whole app as each one. */
export const ROLES: Role[] = Object.keys(ROLE_NAMES) as Role[];

/**
 * Opens every page in a role's menu, then one record of each kind linked
 * from them (a project, a deal, a receipt…), calling `visit` on each once
 * it has settled.
 */
export async function everyPage(
  page: Page,
  role: Role,
  visit: (path: string) => Promise<void>,
) {
  const menu = pagesOf(role);
  const seen = new Set<string>();
  const queue = [...menu];
  for (let i = 0; i < queue.length; i++) {
    const path = queue[i]!;
    await go(page, path);
    if (i < menu.length) {
      const links = await page
        .locator('main a[href^="/"]')
        .evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
      for (const href of links) {
        const kind = href
          .split('?')[0]!
          .replace(/\/(0x)?[0-9a-f-]{8,}|\/\d+(?=\/|$)/gi, '/:id');
        if (kind.includes(':id') && !seen.has(kind)) {
          seen.add(kind);
          queue.push(href);
        }
      }
    }
    // Let lists and charts settle.
    await page.waitForTimeout(400);
    await visit(path);
  }
}

/**
 * A test that fails on any error the page logs or throws, except failed
 * network requests the app already handles (a 401 before a session renews).
 */
export const test = base.extend<{ errors: string[] }>({
  errors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (
        m.type() === 'error' &&
        !/Failed to load resource|401|429/.test(m.text())
      )
        errors.push(m.text());
    });
    await use(errors);
    expect(errors, 'errors in the browser console').toEqual([]);
  },
});

export { expect };
