import AxeBuilder from '@axe-core/playwright';
import {
  everyPage,
  expect,
  ROLES,
  signInAs,
  SUPER_ADMIN,
  switchLanguage,
  test,
} from './support';

/**
 * Every role's every menu page and one record of each kind checked with axe
 * against WCAG 2.1 AA (names, labels, contrast, landmarks, focusable
 * controls), in English and then the sign-in page in Bengali. On the phone
 * every control is also at least 44 px each way, as fingers need, and no
 * page scrolls sideways.
 */
const RULES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** axe's findings on the page as it stands, one line per element. */
async function findings(page: Parameters<typeof everyPage>[0]) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(RULES)
    .analyze();
  return violations.flatMap((v) =>
    v.nodes.map(
      (n) =>
        `${v.id} (${v.impact}): ${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1]?.trim() ?? v.help}`,
    ),
  );
}

/**
 * Controls smaller than 44 px either way. Not counted: links inside running
 * text, the skip link (shown on keyboard focus only), inputs drawn as the
 * cards around them, and links stretched over their whole card (::after).
 */
async function smallTargets(page: Parameters<typeof everyPage>[0]) {
  return page.evaluate(() => {
    const out: string[] = [];
    const controls = document.querySelectorAll<HTMLElement>(
      'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=checkbox], [role=switch], [role=radio], [role=combobox]',
    );
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      if (el.matches('a[href="#main"]')) continue;
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline')
        continue;
      if (getComputedStyle(el, '::after').position === 'absolute') continue;
      if (r.width < 44 || r.height < 44) {
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? '')
          .trim()
          .slice(0, 40);
        out.push(
          `target-size: ${el.tagName.toLowerCase()} "${name}" is ${Math.round(r.width)}×${Math.round(r.height)} px`,
        );
      }
    }
    return out;
  });
}

test('sign-in and the public pages', async ({ page, errors }) => {
  void errors;
  const problems: string[] = [];
  for (const lang of ['en', 'bn'] as const) {
    await page.goto('/sign-in');
    if (lang === 'bn') await switchLanguage(page, 'bn');
    for (const tab of [null, 'Demo', 'ডেমো']) {
      if (tab) {
        const button = page.getByRole('tab', { name: tab });
        if (!(await button.count())) continue;
        await button.click();
      }
      problems.push(...(await findings(page)).map((f) => `${lang}: ${f}`));
    }
  }
  expect(problems).toEqual([]);
});

for (const role of ROLES) {
  test(`${role}: every page passes axe`, async ({ page, errors }, info) => {
    void errors;
    test.skip(
      role === 'super_admin' && !SUPER_ADMIN.password,
      'Set E2E_SUPER_ADMIN_PASSWORD to include the super admin',
    );
    await signInAs(page, role);
    const problems: string[] = [];
    const phone = info.project.name === 'phone';
    await everyPage(page, role, async (path) => {
      for (const f of await findings(page)) problems.push(`${path}: ${f}`);
      if (phone) {
        for (const f of await smallTargets(page))
          problems.push(`${path}: ${f}`);
        const wide = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1,
        );
        if (wide) problems.push(`${path}: scrolls sideways`);
      }
    });
    expect(problems).toEqual([]);
  });
}
