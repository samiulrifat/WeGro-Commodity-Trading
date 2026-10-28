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
 * controls), in English and then the sign-in page in Bengali.
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
  test(`${role}: every page passes axe`, async ({ page, errors }) => {
    void errors;
    test.skip(
      role === 'super_admin' && !SUPER_ADMIN.password,
      'Set E2E_SUPER_ADMIN_PASSWORD to include the super admin',
    );
    await signInAs(page, role);
    const problems: string[] = [];
    await everyPage(page, role, async (path) => {
      for (const f of await findings(page)) problems.push(`${path}: ${f}`);
    });
    expect(problems).toEqual([]);
  });
}
