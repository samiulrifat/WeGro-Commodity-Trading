import { en } from '../src/i18n/en';
import {
  expect,
  go,
  pagesOf,
  type Role,
  signInAs,
  SUPER_ADMIN,
  switchLanguage,
  test,
} from './support';

/**
 * Every role's every menu page in Bengali (item 24): no English sentence
 * and no string from the English dictionary may show, and nothing may
 * scroll sideways. People's and projects' own names are theirs and stay.
 */
const ROLES: Role[] = [
  'super_admin',
  'admin',
  'operations',
  'accounts',
  'auditor',
  'field_officer',
  'farmer',
  'investor',
  'buyer',
  'seller',
  'supplier',
  'warehouse',
  'insurer',
  'bank',
];

/** Every English string the app has, as written (with no values to fill). */
function englishStrings(tree: object, out = new Set<string>()): Set<string> {
  for (const v of Object.values(tree)) {
    if (typeof v === 'string') {
      if (!v.includes('{{') && /[a-z]{3,}/i.test(v)) out.add(v.trim());
    } else englishStrings(v as object, out);
  }
  return out;
}
const ENGLISH = englishStrings(en);
// Words of English sentences; names rarely hold two of them.
const STOPWORDS =
  /\b(the|your|you|is|are|was|be|to|of|and|for|this|that|with|from|not|no|has|have|will|can|on|in|it|by)\b/gi;
// Names that stay in English everywhere.
const ALLOWED = /^(WeGro|CSV|JSON|PDF|JPEG|PNG|WebP|SMS|QR|A4)$/;

for (const role of ROLES) {
  test(`${role}: every page reads in Bengali`, async ({ page, errors }) => {
    void errors;
    test.skip(
      role === 'super_admin' && !SUPER_ADMIN.password,
      'Set E2E_SUPER_ADMIN_PASSWORD to include the super admin',
    );
    await signInAs(page, role);
    await switchLanguage(page, 'bn');
    const problems: string[] = [];
    // The menu's pages, then one record of each kind found linked from them
    // (a project, a deal, a receipt…), so record pages are read too.
    const seen = new Set<string>();
    const queue = pagesOf(role);
    for (let i = 0; i < queue.length; i++) {
      const path = queue[i]!;
      await go(page, path);
      if (i < pagesOf(role).length) {
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
      const texts = await page.locator('body').evaluate((body) => {
        const out: string[] = [];
        const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          const el = n.parentElement;
          // translate="no": names and raw values kept as written on purpose.
          if (
            !el ||
            el.closest(
              'script, style, code, [aria-hidden="true"], [translate="no"]',
            )
          )
            continue;
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden')
            continue;
          const text = n.textContent?.trim();
          if (text && /[A-Za-z]{3,}/.test(text)) out.push(text);
        }
        return out;
      });
      for (const text of new Set(texts)) {
        if (ALLOWED.test(text)) continue;
        const english =
          ENGLISH.has(text) || (text.match(STOPWORDS)?.length ?? 0) >= 2;
        if (english) problems.push(`${path}: ${text.slice(0, 120)}`);
      }
      const wide = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      if (wide) problems.push(`${path}: scrolls sideways`);
    }
    expect(problems).toEqual([]);
  });
}
