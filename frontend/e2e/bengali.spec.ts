import { en } from '../src/i18n/en';
import {
  everyPage,
  expect,
  ROLES,
  signInAs,
  SUPER_ADMIN,
  test,
} from './support';

/**
 * Every role's every menu page in Bengali (item 24): no English sentence
 * and no string from the English dictionary may show, and nothing may
 * scroll sideways. People's and projects' own names are theirs and stay.
 */

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
    await signInAs(page, role, 'bn');
    const problems: string[] = [];
    await everyPage(page, role, async (path) => {
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
    });
    expect(problems).toEqual([]);
  });
}
