// Writes docs/translations-review.csv: every string the app shows, English
// beside Bengali, for a native speaker to check (NFR-8). One row per key,
// with the screen area it belongs to and what fills each {{blank}}.
// Run with `npm run i18n:review`; open the file in a spreadsheet.
import { writeFileSync } from 'node:fs';

const { en } = await import('../src/i18n/en.ts');
const { bn } = await import('../src/i18n/bn.ts');

/** Every key's path and its string. */
function leaves(tree, path = '', out = new Map()) {
  for (const [k, v] of Object.entries(tree)) {
    const key = path ? `${path}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else leaves(v, key, out);
  }
  return out;
}

/** Where a key is seen, by its first part. */
const AREAS = {
  units: 'Counts (shared)', roles: 'Roles (shared)', words: 'Statuses (shared)',
  errors: 'Error messages', notifications: 'Notifications', nav: 'Menus',
  shell: 'App frame', states: 'Loading, empty and error states',
  signIn: 'Sign in', signUp: 'Sign up', forgot: 'Forgotten password',
  account: 'My account', people: 'People', person: 'Person',
  projects: 'Projects', booking: 'Bookings and payment proofs',
  vouchers: 'Vouchers', farmUpdates: 'Farm updates', warehouse: 'Warehouse',
  market: 'Marketplace', insurance: 'Insurance', payouts: 'Payouts',
  trackRecords: 'Track records', catalog: 'Catalog', bank: 'Bank details',
  dashboard: 'Dashboard', notificationsPage: 'Notifications page',
  audit: 'History and audit', system: 'System status', pwa: 'Installing the app',
  districts: 'District names',
  idCheck: 'ID checks (People)', payments: 'Payment confirmations',
  changes: 'Detail change requests', holdings: 'My holdings',
  refunds: 'Refunds', verifyReceipt: 'Receipt check (public page)',
  verifyBatch: 'Batch check (public page)', phoneCode: 'Phone codes',
  paymentAccounts: 'Payment accounts', formats: 'Number and date formats',
  password: 'Passwords', pages: 'Page not found and no access',
  changePassword: 'Change password', pager: 'Page numbers',
  statusPage: 'Registration status', language: 'Language switch',
  search: 'Search boxes',
};

const csv = (s) => `"${String(s).replace(/"/g, '""')}"`;
const blanks = (s) =>
  [...s.matchAll(/\{\{\s*(\w+)[^}]*\}\}/g)].map((m) => m[1]).join(' ');

const english = leaves(en);
const bengali = leaves(bn);
const rows = [['key', 'area', 'english', 'bengali', 'blanks', 'reviewer note']];
for (const [key, text] of english) {
  const top = key.split('.')[0];
  rows.push([key, AREAS[top] ?? top, text, bengali.get(key) ?? '', blanks(text), '']);
}
// A byte-order mark, so spreadsheets read the Bengali as UTF-8.
writeFileSync(
  new URL('../docs/translations-review.csv', import.meta.url),
  '﻿' + rows.map((r) => r.map(csv).join(',')).join('\n') + '\n',
);
console.log(`docs/translations-review.csv: ${rows.length - 1} strings`);
