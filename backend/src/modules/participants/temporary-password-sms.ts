import { Language } from '../users/language';

/**
 * The text that hands someone their temporary password: on registration, or
 * when an admin resets a forgotten one. English unless they chose Bengali.
 */
export function temporaryPasswordText(
  kind: 'registered' | 'reset',
  language: Language | null,
  password: string,
): string {
  if (language === Language.BENGALI) {
    const what =
      kind === 'registered'
        ? 'আপনার অ্যাকাউন্ট তৈরি হয়েছে।'
        : 'আপনার পাসওয়ার্ড নতুন করে দেওয়া হয়েছে।';
    return `WeGro: ${what} এই নম্বর ও অস্থায়ী পাসওয়ার্ড ${password} দিয়ে সাইন ইন করে নিজের পাসওয়ার্ড বেছে নিন। কাউকে জানাবেন না।`;
  }
  const what =
    kind === 'registered'
      ? 'your account is ready.'
      : 'your password was reset.';
  return `WeGro: ${what} Sign in with this number and the temporary password ${password}, then choose your own. Never share it.`;
}
