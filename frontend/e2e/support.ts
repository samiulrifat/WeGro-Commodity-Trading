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
 * would, pacing sign-ins under the limit and waiting out a refusal.
 */
export async function signInAs(page: Page, role: Role): Promise<void> {
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
    ]);
    if (outcome === 'in') return;
    await page.waitForTimeout(30_000);
  }
  throw new Error(`Could not sign in as ${role}`);
}

/** Switches the app's language with the switch in the top bar. */
export async function switchLanguage(page: Page, lang: 'en' | 'bn') {
  await page
    .getByRole('button', { name: lang === 'bn' ? 'বাংলা' : 'EN' })
    .first()
    .click();
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
