import { describe, expect, it } from 'vitest';
import {
  formatCompact,
  formatDate,
  formatDateTime,
  formatMonth,
  formatNumber,
  formatRelative,
  formatTaka,
  formatTime,
  latinDigits,
  localDigits,
} from './format';

describe('numbers', () => {
  it('groups in thousands, with Bengali digits in Bengali', () => {
    expect(formatNumber(1234567, 'en')).toBe('1,234,567');
    expect(formatNumber(1234567, 'bn')).toBe('১,২৩৪,৫৬৭');
    expect(formatNumber(999, 'en')).toBe('999');
    expect(formatNumber(-1234.5, 'en')).toBe('-1,234.5');
    expect(formatNumber(2.345, 'en', { decimals: 1 })).toBe('2.3');
  });

  it('keeps decimal strings exactly, however long', () => {
    expect(formatNumber('12345678901234567890.25', 'en')).toBe(
      '12,345,678,901,234,567,890.25',
    );
    expect(formatNumber('0012.5', 'en')).toBe('12.5');
    expect(formatNumber('not a number', 'en')).toBe('not a number');
  });

  it('turns digits both ways', () => {
    expect(localDigits('Reservation 2026', 'bn')).toBe('Reservation ২০২৬');
    expect(localDigits('2026', 'en')).toBe('2026');
    expect(latinDigits('০১৭১২৩৪৫৬৭৮')).toBe('01712345678');
    expect(latinDigits('৳ ১,২৫০.৫০')).toBe('৳ 1,250.50');
  });
});

describe('taka', () => {
  it('shows poisha only when there are some', () => {
    expect(formatTaka('1234567.00', 'en')).toBe('৳ 1,234,567');
    expect(formatTaka('1234567.50', 'en')).toBe('৳ 1,234,567.50');
    expect(formatTaka('1234567.5', 'en')).toBe('৳ 1,234,567.50');
    expect(formatTaka('45000', 'bn')).toBe('৳ ৪৫,০০০');
    expect(formatTaka('0.05', 'bn')).toBe('৳ ০.০৫');
  });

  it('is exact beyond what a float can hold', () => {
    // 2^53 + 1 taka and 1 poisha: a float would lose both.
    expect(formatTaka('9007199254740993.01', 'en')).toBe(
      '৳ 9,007,199,254,740,993.01',
    );
  });

  it('puts the sign before the taka sign', () => {
    expect(formatTaka('-250.00', 'en')).toBe('-৳ 250');
    expect(formatTaka(-1_200_000, 'en', { compact: true })).toBe('-৳ 1.2M');
  });

  it('shortens for cards and charts', () => {
    expect(formatTaka('657700000.00', 'en', { compact: true })).toBe(
      '৳ 657.7M',
    );
    expect(formatTaka('657700000.00', 'bn', { compact: true })).toBe(
      '৳ ৬৫৭.৭ মিলিয়ন',
    );
  });
});

describe('compact', () => {
  it('uses K, M and B (হাজার, মিলিয়ন, বিলিয়ন)', () => {
    expect(formatCompact(950, 'en')).toBe('950');
    expect(formatCompact(12_500, 'en')).toBe('12.5K');
    expect(formatCompact(3_000_000, 'en')).toBe('3M');
    expect(formatCompact(1_250_000_000, 'en')).toBe('1.3B');
    expect(formatCompact(12_500, 'bn')).toBe('১২.৫ হাজার');
  });

  it('moves up a unit instead of showing 1000K', () => {
    expect(formatCompact(999_960, 'en')).toBe('1M');
    expect(formatCompact(999_940, 'en')).toBe('999.9K');
  });
});

describe('dates', () => {
  // 15:30 UTC is 21:30 in Dhaka; 20:00 UTC is already the next day there.
  const evening = '2026-10-17T15:30:00Z';
  const lateNight = '2026-10-17T20:00:00.000Z';

  it('shows instants in Bangladesh time, wherever the device is', () => {
    expect(formatDate(evening, 'en')).toBe('17 Oct 2026');
    expect(formatDate(lateNight, 'en')).toBe('18 Oct 2026');
    expect(formatTime(evening, 'en')).toBe('9:30 PM');
    expect(formatDateTime(evening, 'en')).toBe('17 Oct 2026, 9:30 PM');
    expect(formatDateTime(evening, 'bn')).toBe('১৭ অক্টোবর ২০২৬, রাত ৯:৩০');
  });

  it('never shifts a calendar day', () => {
    expect(formatDate('2026-01-01', 'en')).toBe('1 Jan 2026');
    expect(formatDate('2026-12-31', 'bn')).toBe('৩১ ডিসেম্বর ২০২৬');
    expect(formatMonth('2026-10-01', 'bn')).toBe('অক্টোবর ২০২৬');
  });

  it('says the part of the day in Bengali', () => {
    // UTC times; Dhaka is six hours ahead.
    expect(formatTime('2026-10-16T23:00:00Z', 'bn')).toBe('ভোর ৫:০০');
    expect(formatTime('2026-10-17T00:05:00Z', 'bn')).toBe('সকাল ৬:০৫');
    expect(formatTime('2026-10-17T07:05:00Z', 'bn')).toBe('দুপুর ১:০৫');
    expect(formatTime('2026-10-17T10:05:00Z', 'bn')).toBe('বিকাল ৪:০৫');
    expect(formatTime('2026-10-17T12:30:00Z', 'bn')).toBe('সন্ধ্যা ৬:৩০');
    expect(formatTime('2026-10-16T18:05:00Z', 'bn')).toBe('রাত ১২:০৫');
    expect(formatTime('2026-10-16T18:05:00Z', 'en')).toBe('12:05 AM');
    expect(formatTime('2026-10-17T06:00:00Z', 'en')).toBe('12:00 PM');
  });

  it('says how long ago for the last week, then the date', () => {
    const now = Date.parse(evening);
    expect(formatRelative(now - 5 * 60_000, 'en', now)).toBe('5 minutes ago');
    expect(formatRelative(now - 5 * 60_000, 'bn', now)).toBe('৫ মিনিট আগে');
    expect(formatRelative(now - 86_400_000, 'en', now)).toBe('yesterday');
    expect(formatRelative(now - 10 * 86_400_000, 'en', now)).toBe('7 Oct 2026');
  });

  it('shows a dash for a value that is not a date', () => {
    expect(formatDate('soon', 'en')).toBe('—');
    expect(formatDateTime('soon', 'en')).toBe('—');
  });
});
