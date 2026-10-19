import { beforeAll, describe, expect, it } from 'vitest';
import { applyLanguage, i18n, initI18n } from '@/i18n';
import { checkText, problemsOf } from './id-check-text';
import { parsePeopleSearch, searchArgs } from './people-search';
import { canManage, registrableRoles } from './permissions';
import type { IdCheck } from './person';

describe('the people list address', () => {
  it('keeps only filters the list understands', () => {
    expect(
      parsePeopleSearch({
        page: '3',
        role: 'farmer',
        status: 'pending',
        district: 'BOGURA',
        q: ' 01712345678 ',
      }),
    ).toEqual({
      page: 3,
      role: 'farmer',
      status: 'pending',
      district: 'BOGURA',
      q: '01712345678',
    });
    expect(
      parsePeopleSearch({
        page: '1',
        role: 'super_admin',
        status: 'gone',
        district: 'ATLANTIS',
        q: 'x'.repeat(41),
      }),
    ).toEqual({});
  });

  it('searches a number by phone and anything else by NID', () => {
    expect(searchArgs('০১৭১২-৩৪৫৬৭৮')).toEqual({ phone: '01712345678' });
    expect(searchArgs('+8801712345678')).toEqual({ phone: '+8801712345678' });
    expect(searchArgs('1234 567 890')).toEqual({ nid: '1234567890' });
    expect(searchArgs('  ')).toEqual({});
  });
});

describe('who manages and registers whom', () => {
  it('leaves staff to the super admin and everyone else to admins', () => {
    expect(canManage('super_admin', 'field_officer')).toBe(true);
    expect(canManage('admin', 'field_officer')).toBe(false);
    expect(canManage('admin', 'farmer')).toBe(true);
    expect(canManage('super_admin', 'farmer')).toBe(false);
    expect(canManage('field_officer', 'farmer')).toBe(false);
  });

  it('lets field officers register farmers only', () => {
    expect(registrableRoles('field_officer')).toEqual(['farmer']);
    expect(registrableRoles('admin')).not.toContain('admin');
    expect(registrableRoles('super_admin')).toContain('auditor');
    expect(registrableRoles('auditor')).toEqual([]);
  });
});

describe('ID check wording', () => {
  beforeAll(() => initI18n('en'));

  const differs: IdCheck = {
    code: 'NID_DISTRICT',
    result: 'warn',
    reason: 'NID_DISTRICT_DIFFERENT',
    message: 'NID was issued in a different district from the one given',
    params: { issued: 'DHAKA', given: 'BOGURA' },
  };

  it('words a reason with its values, districts by name', async () => {
    await applyLanguage('en');
    expect(checkText(differs, i18n.t)).toBe(
      'Issued in Dhaka, not Bogura. This happens when someone lives away from home.',
    );
    await applyLanguage('bn');
    expect(checkText(differs, i18n.t)).toContain('ঢাকা');
    expect(
      checkText(
        { ...differs, reason: 'AGE_UNDER', params: { min: 18 } },
        i18n.t,
      ),
    ).toBe('বয়স কমপক্ষে ১৮ বছর হতে হবে।');
  });

  it('keeps the English of checks saved before reasons were', async () => {
    await applyLanguage('bn');
    const { reason: _r, params: _p, ...old } = differs;
    expect(checkText(old, i18n.t)).toBe(differs.message);
  });

  it('puts the first failure of each detail under its field', async () => {
    await applyLanguage('en');
    const fail = (code: string, reason: IdCheck['reason']): IdCheck => ({
      code,
      result: 'fail',
      reason,
      message: '',
      params: { min: 18 },
    });
    expect(
      problemsOf(
        [
          fail('NID_FORMAT', 'NID_LENGTH'),
          fail('NID_BIRTH_YEAR', 'NID_BIRTH_YEAR_MISMATCH'),
          fail('AGE', 'AGE_UNDER'),
          differs,
        ],
        i18n.t,
      ),
    ).toEqual({
      nid: 'The NID must have 10 (smart card), 13 or 17 digits.',
      dateOfBirth: 'Must be at least 18 years old.',
    });
  });
});
