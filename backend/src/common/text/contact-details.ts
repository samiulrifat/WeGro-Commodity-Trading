/** Separators people put inside a number; a word or a letter ends it. */
const NUMBER = /\+?[0-9](?:[\s\-.()/]{0,2}[0-9])+/g;
/** A Bangladeshi mobile number, with or without its country code. */
const MOBILE = /^(?:\+?88)?0?1[3-9][0-9]{8}$/;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const LINK = /https?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|bd|me|io|co)\b/i;
const APP =
  /\b(?:whats\s?app|telegram|viber|imo|messenger|facebook)\b|হোয়াটসঅ্যাপ|টেলিগ্রাম|ভাইবার|ইমো|মেসেঞ্জার|ফেসবুক/i;

/** Bengali digits as the plain ones, so both are checked alike. */
const plainDigits = (text: string): string =>
  text.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));

/**
 * Whether free text the other side of a sale reads carries a way to reach
 * its writer: buyers and sellers stay unknown to each other so that every
 * deal goes through the platform. It catches what is plainly written; a
 * number spelt out in words gets past it.
 */
export function hasContactDetails(text: string): boolean {
  const plain = plainDigits(text);
  if (EMAIL.test(plain) || LINK.test(plain) || APP.test(plain)) return true;
  return (plain.match(NUMBER) ?? []).some((n) =>
    MOBILE.test(n.replace(/[\s\-.()/]/g, '')),
  );
}
