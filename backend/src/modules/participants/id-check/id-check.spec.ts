import { DISTRICT_BY_GEO, DISTRICT_CODES } from './bd-districts';
import {
  type IdCheckInput,
  nidIdentity,
  normaliseNid,
  normalisePhone,
  runIdCheck,
  toAsciiDigits,
} from './id-check';

// 2026-10-11 10:00 in Dhaka.
const NOW = new Date('2026-10-11T04:00:00Z');

const valid: IdCheckInput = {
  fullName: '  Md.   Rahim  Uddin ',
  phone: '017-1234-5678',
  nid: '1990 1012 3456 78901',
  dateOfBirth: '1990-05-14',
  district: 'bogura',
  address: 'Village Shibganj,   Bogura',
};

const check = (overrides: Partial<IdCheckInput>, now = NOW) =>
  runIdCheck({ ...valid, ...overrides }, now);

const result = (report: ReturnType<typeof runIdCheck>, code: string) =>
  report.checks.find((c) => c.code === code)?.result;

describe('districts', () => {
  it('lists all 64 districts with unique geo-codes', () => {
    expect(DISTRICT_CODES).toHaveLength(64);
    expect(DISTRICT_BY_GEO.size).toBe(64);
  });
});

describe('normalisation', () => {
  it('turns Bengali digits into ASCII', () => {
    expect(toAsciiDigits('০১৭১২৩৪৫৬৭৮')).toBe('01712345678');
  });

  it.each([
    ['01712345678', '+8801712345678'],
    ['+8801712345678', '+8801712345678'],
    ['8801712345678', '+8801712345678'],
    ['017 1234 5678', '+8801712345678'],
    ['(017) 1234-5678', '+8801712345678'],
    ['০১৭১২৩৪৫৬৭৮', '+8801712345678'],
    ['01312345678', '+8801312345678'],
    ['01912345678', '+8801912345678'],
  ])('accepts phone %s', (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  it.each([
    '01212345678', // no 012 operator
    '0171234567', // too short
    '017123456789', // too long
    '+8701712345678', // wrong country
    '1712345678', // missing leading 0
    '0171234567a',
    '',
  ])('rejects phone %s', (input) => {
    expect(normalisePhone(input)).toBeNull();
  });

  it('keeps only digits in an NID and rejects anything else', () => {
    expect(normaliseNid(' 1990-1012 3456 78901 ')).toBe('19901012345678901');
    expect(normaliseNid('১২৩৪৫৬৭৮৯০')).toBe('1234567890');
    expect(normaliseNid('12345O7890')).toBeNull();
  });

  it('reduces the 17-digit NID to the same identity as its 13-digit form', () => {
    expect(nidIdentity('19901012345678901')).toBe('1012345678901');
    expect(nidIdentity('1012345678901')).toBe('1012345678901');
    expect(nidIdentity('5012345678')).toBe('5012345678');
  });
});

describe('runIdCheck', () => {
  it('passes a correct person and returns the canonical details', () => {
    const report = check({});
    expect(report.outcome).toBe('passed');
    expect(report.checks.every((c) => c.result === 'pass')).toBe(true);
    expect(report.details).toEqual({
      fullName: 'Md. Rahim Uddin',
      phone: '+8801712345678',
      nid: '19901012345678901',
      dateOfBirth: '1990-05-14',
      district: 'BOGURA',
      address: 'Village Shibganj, Bogura',
    });
  });

  it('gives the same details for the same person typed differently', () => {
    const a = check({}).details;
    const b = check({
      fullName: 'Md. Rahim Uddin',
      phone: '+880 1712-345678',
      nid: '19901012345678901',
      dateOfBirth: '১৯৯০-০৫-১৪',
      district: 'BOGURA',
      address: 'Village Shibganj, Bogura',
    }).details;
    expect(b).toEqual(a);
  });

  it('accepts Bengali names, including vowel signs', () => {
    expect(result(check({ fullName: 'মোঃ রহিম উদ্দিন' }), 'NAME')).toBe('pass');
    expect(result(check({ fullName: "Rahim O'Neil-Khan" }), 'NAME')).toBe(
      'pass',
    );
  });

  it.each(['R', 'Rahim123', 'Rahim <script>', '...', '--', 'A'.repeat(101)])(
    'fails the name %s',
    (fullName) => {
      const report = check({ fullName });
      expect(report.outcome).toBe('failed');
      expect(result(report, 'NAME')).toBe('fail');
      expect(report.details).toBeUndefined();
    },
  );

  describe('date of birth and age', () => {
    it('rejects impossible dates', () => {
      for (const dateOfBirth of [
        '1990-02-30',
        '1990-13-01',
        '90-05-14',
        '1990/05/14',
      ]) {
        expect(
          result(check({ dateOfBirth, nid: '5012345678' }), 'DATE_OF_BIRTH'),
        ).toBe('fail');
      }
    });

    it('accepts 29 February in a leap year only', () => {
      expect(
        result(check({ dateOfBirth: '1992-02-29', nid: '5012345678' }), 'AGE'),
      ).toBe('pass');
      expect(
        result(
          check({ dateOfBirth: '1991-02-29', nid: '5012345678' }),
          'DATE_OF_BIRTH',
        ),
      ).toBe('fail');
    });

    it('needs 18 full years, counted on the Bangladesh calendar day', () => {
      const nid = '5012345678';
      // Turns 18 on 2026-10-11 (today in Dhaka): allowed.
      expect(result(check({ dateOfBirth: '2008-10-11', nid }), 'AGE')).toBe(
        'pass',
      );
      // Turns 18 tomorrow: not yet.
      expect(result(check({ dateOfBirth: '2008-10-12', nid }), 'AGE')).toBe(
        'fail',
      );
      // 2026-10-10 20:00 UTC is already 2026-10-11 in Dhaka.
      expect(
        result(
          check(
            { dateOfBirth: '2008-10-11', nid },
            new Date('2026-10-10T20:00:00Z'),
          ),
          'AGE',
        ),
      ).toBe('pass');
      expect(
        result(
          check(
            { dateOfBirth: '2008-10-11', nid },
            new Date('2026-10-10T17:00:00Z'),
          ),
          'AGE',
        ),
      ).toBe('fail');
    });

    it('rejects future dates and implausible ages', () => {
      const nid = '5012345678';
      expect(
        result(check({ dateOfBirth: '2027-01-01', nid }), 'DATE_OF_BIRTH'),
      ).toBe('fail');
      expect(result(check({ dateOfBirth: '1900-01-01', nid }), 'AGE')).toBe(
        'fail',
      );
    });
  });

  describe('NID', () => {
    it('accepts 10-, 13- and 17-digit NIDs', () => {
      expect(check({ nid: '5012345678' }).outcome).toBe('passed');
      expect(check({ nid: '1012345678901' }).outcome).toBe('passed');
      expect(check({ nid: '19901012345678901' }).outcome).toBe('passed');
    });

    it.each([
      '501234567',
      '50123456789',
      '123456789012345',
      '199010123456789012',
    ])('fails the length of %s', (nid) => {
      expect(result(check({ nid }), 'NID_FORMAT')).toBe('fail');
    });

    it.each([
      '0000000000',
      '1111111111111',
      '1234567890',
      '0123456789',
      '9876543210',
    ])('fails the placeholder %s', (nid) => {
      expect(result(check({ nid }), 'NID_FORMAT')).toBe('fail');
    });

    it('fails a 17-digit NID whose birth year differs from the date of birth', () => {
      const report = check({ nid: '19911012345678901' });
      expect(report.outcome).toBe('failed');
      expect(result(report, 'NID_BIRTH_YEAR')).toBe('fail');
    });

    it('flags (does not fail) an NID issued in another district', () => {
      // 26 = Dhaka; the person lives in Bogura.
      const report = check({ nid: '19902612345678901' });
      expect(report.outcome).toBe('flagged');
      expect(result(report, 'NID_DISTRICT')).toBe('warn');
      expect(report.details).toBeDefined();
    });

    it('flags an old NID whose district code is not a district', () => {
      const report = check({ nid: '9912345678901' });
      expect(result(report, 'NID_DISTRICT')).toBe('warn');
    });

    it('does not check districts on 10-digit smart card NIDs', () => {
      const report = check({ nid: '5012345678' });
      expect(result(report, 'NID_DISTRICT')).toBeUndefined();
    });
  });

  it('fails unknown districts and bad addresses', () => {
    expect(result(check({ district: 'ATLANTIS' }), 'DISTRICT')).toBe('fail');
    expect(result(check({ district: 'toString' }), 'DISTRICT')).toBe('fail');
    expect(result(check({ address: 'abc' }), 'ADDRESS')).toBe('fail');
    expect(result(check({ address: 'Road 1\u0000Bogura' }), 'ADDRESS')).toBe(
      'fail',
    );
  });

  it('never repeats personal details in its messages', () => {
    const report = check({ nid: '19911012345678901', phone: '0121' });
    const text = JSON.stringify(report.checks);
    for (const secret of [
      '19911012345678901',
      '0121',
      'Rahim',
      '1990-05-14',
      'Shibganj',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('reports every failed rule at once', () => {
    const report = runIdCheck(
      {
        fullName: '1',
        phone: '1',
        nid: 'x',
        dateOfBirth: 'x',
        district: 'x',
        address: '',
      },
      NOW,
    );
    const failed = report.checks
      .filter((c) => c.result === 'fail')
      .map((c) => c.code);
    expect(failed).toEqual(
      expect.arrayContaining([
        'NAME',
        'PHONE_FORMAT',
        'DATE_OF_BIRTH',
        'DISTRICT',
        'ADDRESS',
        'NID_FORMAT',
      ]),
    );
  });
});
