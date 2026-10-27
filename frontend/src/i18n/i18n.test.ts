import { beforeAll, describe, expect, it } from 'vitest';
import type { ApiError } from '@/api/errors';
import { bn } from './bn';
import { en } from './en';
import { applyLanguage, i18n, initI18n } from './index';
import { errorText, fieldErrors, notificationText } from './text';

/** Every key's path and its string. */
function leaves(tree: object, path = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = path ? `${path}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else for (const [p, s] of leaves(v as object, key)) out.set(p, s);
  }
  return out;
}

/** What a string fills in: {{values}} and $t(nested) references. */
const slots = (text: string) =>
  [...text.matchAll(/\{\{[^}]+\}\}|\$t\([^,)]+/g)].map((m) => m[0]).sort();

describe('translations', () => {
  it('has every English key in Bengali, filling in the same values', () => {
    const english = leaves(en);
    const bengali = leaves(bn);
    expect([...bengali.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [key, text] of english) {
      expect({ key, slots: slots(bengali.get(key) ?? '') }).toEqual({
        key,
        slots: slots(text),
      });
    }
  });

  // The glossary (docs/bengali-glossary.md): one word per idea, so a reader
  // never wonders whether two words mean two things.
  it('keeps to the glossary’s one word per idea', () => {
    const retired: Array<[RegExp, string]> = [
      [/অফার/, 'প্রস্তাব (offer)'],
      [/বিমা/, 'বীমা (insurance)'],
      [/রিজার্ভেশন/, 'বুকিং (booking)'],
      [/স্লট/, 'ইউনিট (unit)'],
      [/ডেলিভারি/, 'সরবরাহ (delivery)'],
      [/নোটিফিকেশন/, 'বিজ্ঞপ্তি (notification)'],
      [/পেআউট|রাউন্ড(?!িং)/, 'অর্থ প্রদান পর্ব (payout round)'],
      [/খামার আপডেট|খামার হালনাগাদ/, 'খামারের হালনাগাদ (farm update)'],
    ];
    const found = [...leaves(bn)].flatMap(([key, text]) =>
      retired
        .filter(([re]) => re.test(text))
        .map(([, use]) => `${key}: use ${use}`),
    );
    expect(found).toEqual([]);
    // English: a booking holds units (never "reservation" or "slots").
    const shown = (text: string) =>
      text.replace(/\{\{[^}]*\}\}|\$t\([^)]*\)/g, '');
    const english = [...leaves(en)].filter(([, text]) =>
      /\b(reservations?|slots?)\b/i.test(shown(text)),
    );
    expect(english.map(([key]) => key)).toEqual([]);
  });
});

describe('formats in sentences', () => {
  it('are all ones the app registers', () => {
    const known = new Set([
      'number',
      'taka',
      'date',
      'datetime',
      'role',
      'word',
      'district',
    ]);
    const used = [...leaves(en).values()].flatMap((text) =>
      [...text.matchAll(/\{\{\s*\w+\s*,\s*(\w+)\s*\}\}/g)].map((m) => m[1]),
    );
    expect(used.filter((f) => !known.has(f!))).toEqual([]);
  });
});

describe('numbers put into sentences', () => {
  beforeAll(() => initI18n('en'));

  it('reads bare numbers in the reader’s digits, and leaves names, codes and written digits alone', async () => {
    const t = i18n.t.bind(i18n) as unknown as (
      key: string,
      values?: Record<string, unknown>,
    ) => string;
    await applyLanguage('bn');
    // A record number sent as text, and one as a number.
    expect(
      t('dashboard.item.dealUnpaid', {
        id: '12',
        quantity: '200 kg',
        produce: 'টমেটো',
      }),
    ).toBe('চুক্তি #১২: 200 kg টমেটো');
    expect(t('audit.block', { n: 4815 })).toBe('ব্লক ৪৮১৫');
    // Mixed text (a name with digits, an id) is someone's own: unchanged.
    expect(t('trackRecords.fieldOfficer', { name: 'Officer 2' })).toBe(
      'মাঠ কর্মকর্তা: Officer 2',
    );
    // Digits written into the sentence itself stay: a phone number to copy.
    expect(t('errors.code.PHONE_INVALID')).toContain('01712345678');
    await applyLanguage('en');
    expect(t('audit.block', { n: 4815 })).toBe('block 4815');
  });
});

describe('server text in the reader’s language', () => {
  beforeAll(() => initI18n('en'));

  const locked: ApiError = {
    kind: 'rate-limited',
    status: 429,
    messages: ['Too many failed sign-in attempts. Try again in 2 minutes.'],
    code: 'ACCOUNT_LOCKED',
    details: { minutes: 2 },
  };

  it('words an error by its code, with its values and plurals', async () => {
    await applyLanguage('en');
    expect(errorText(locked, i18n)).toBe(
      'Too many failed sign-in attempts. Try again in 2 minutes.',
    );
    expect(errorText({ ...locked, details: { minutes: 1 } }, i18n)).toBe(
      'Too many failed sign-in attempts. Try again in 1 minute.',
    );
    await applyLanguage('bn');
    expect(errorText(locked, i18n)).toBe(
      'অনেকবার ভুল চেষ্টা হয়েছে। ২ মিনিট পরে আবার চেষ্টা করুন।',
    );
    expect(
      errorText(
        {
          kind: 'not-found',
          status: 404,
          messages: [],
          code: 'NO_DEMO_ACCOUNT',
          details: { role: 'field_officer' },
        },
        i18n,
      ),
    ).toBe('মাঠ কর্মকর্তা-এর জন্য এখনও কোনো ডেমো অ্যাকাউন্ট নেই।');
  });

  it('words a status inside the sentence, and a missing one', async () => {
    const sale: ApiError = {
      kind: 'conflict',
      status: 409,
      messages: ['This sale is paid'],
      code: 'SALE_WRONG_STATUS',
      details: { status: 'paid' },
    };
    await applyLanguage('bn');
    expect(errorText(sale, i18n)).toBe('এই বিক্রিটি পরিশোধিত।');
    expect(
      errorText(
        {
          ...sale,
          code: 'RESERVATION_WRONG_STATUS',
          details: { status: null },
        },
        i18n,
      ),
    ).toBe('এই বুকিংটি আর চালু নেই।');
  });

  it('lists each field an input check refused, and gives forms one per field', async () => {
    const invalid: ApiError = {
      kind: 'invalid',
      status: 400,
      messages: ['slots must not be less than 1', 'name must be a string'],
      code: 'INVALID_INPUT',
      details: {
        fields: [
          { field: 'slots', rule: 'min', limit: 1 },
          { field: 'name', rule: 'required' },
          { field: 'name', rule: 'text' },
        ],
      },
    };
    await applyLanguage('en');
    expect(errorText(invalid, i18n)).toBe(
      'Some details are missing or not valid: slots must be at least 1; name is required; name must be text',
    );
    await applyLanguage('bn');
    expect(fieldErrors(invalid, i18n)).toEqual({
      slots: 'slots কমপক্ষে ১ হতে হবে',
      name: 'name দিতে হবে',
    });
  });

  it('words each problem of a list by its own code, names in Bengali', async () => {
    const record: ApiError = {
      kind: 'invalid',
      status: 422,
      messages: ['The record is not valid'],
      code: 'INVALID_RECORD',
      details: {
        problems: [
          {
            code: 'MEASUREMENT_ABOVE_MAX',
            message: 'plant_height: above the maximum 300',
            details: {
              key: 'plant_height',
              label: 'Plant height',
              labelBn: 'গাছের উচ্চতা',
              max: 300,
            },
          },
          { code: 'LOCATION_OUTSIDE_BANGLADESH', message: 'outside' },
        ],
      },
    };
    await applyLanguage('bn');
    expect(errorText(record, i18n)).toBe(
      'খামারের হালনাগাদটি সঠিক নয়: গাছের উচ্চতা সর্বোচ্চ ৩০০-এর চেয়ে বেশি।; অবস্থানটি বাংলাদেশের বাইরে।',
    );
    await applyLanguage('en');
    expect(errorText(record, i18n)).toContain(
      'Plant height is above the maximum of 300.',
    );
  });

  it('falls back to the server’s English, or in Bengali to the kind', async () => {
    // A ledger refusal: the contract's error name has no wording of its own.
    const ledger: ApiError = {
      kind: 'conflict',
      status: 409,
      messages: ['Wrong offer status'],
      code: 'WrongOfferStatus',
    };
    await applyLanguage('en');
    expect(errorText(ledger, i18n)).toBe('Wrong offer status');
    expect(
      errorText({ kind: 'network', status: null, messages: [] }, i18n),
    ).toBe('Can’t reach WeGro. Check your internet connection and try again.');
    await applyLanguage('bn');
    expect(errorText(ledger, i18n)).toBe(bn.errors.kind.conflict);
  });

  const made = {
    kind: 'reservation.made' as const,
    title: 'Booking #12 awaiting payment confirmation',
    body: '3 units in Bogura maize; holds until 2026-10-18 15:30 UTC',
    params: {
      reservationId: '12',
      slots: 3,
      project: 'Bogura maize',
      expiresAt: '2026-10-18T15:30:00.000Z',
    },
  };

  it('words a notification from its kind and values', async () => {
    await applyLanguage('en');
    expect(notificationText(made, i18n)).toEqual({
      title: 'Booking #12 awaiting payment confirmation',
      body: '3 units in Bogura maize; held until 18 Oct 2026, 9:30 PM',
    });
    await applyLanguage('bn');
    expect(notificationText(made, i18n)).toEqual({
      // The record number stays as sent; counts and times are Bengali.
      title: 'বুকিং #১২ পেমেন্ট নিশ্চিতকরণের অপেক্ষায়',
      body: 'Bogura maize-এ ৩টি ইউনিট; ১৮ অক্টোবর ২০২৬, রাত ৯:৩০ পর্যন্ত রাখা থাকবে',
    });
    expect(
      notificationText(
        {
          kind: 'participant.registered',
          title: 'x',
          body: null,
          params: { role: 'buyer' },
        },
        i18n,
      ).title,
    ).toBe('নতুন নিবন্ধন যাচাইয়ের অপেক্ষায়: ক্রেতা');
  });

  it('names produce in the reader’s language', async () => {
    await applyLanguage('bn');
    expect(
      notificationText(
        {
          kind: 'receipt.issued',
          title: 'Warehouse receipt issued',
          body: '1200.5 MAIZE in storage',
          params: { quantity: '1200.5', produce: 'Maize', produceBn: 'ভুট্টা' },
        },
        i18n,
      ).body,
    ).toBe('১,২০০.৫ ভুট্টা গুদামে রাখা হয়েছে');
  });

  it('keeps the English of notifications saved before their values were', async () => {
    await applyLanguage('bn');
    expect(notificationText({ ...made, params: null }, i18n)).toEqual({
      title: made.title,
      body: made.body,
    });
  });

  it('does not let a value pull in other text', async () => {
    await applyLanguage('en');
    const sneaky = {
      ...made,
      params: { ...made.params, project: '$t(roles.admin)' },
    };
    expect(notificationText(sneaky, i18n).body).toContain(
      'in $t(roles.admin);',
    );
  });
});
