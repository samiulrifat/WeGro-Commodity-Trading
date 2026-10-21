/**
 * Searching titles by words: each word typed must start a word of the text.
 * The same rule in SQL (`wordPattern`, for `~*`) and in memory (`matchesWord`).
 */

/** Words typed in a search, at most five, as plain text. */
export function searchWords(q: string | undefined): string[] {
  return (q ?? '')
    .normalize('NFC')
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => w.length > 0)
    .slice(0, 5);
}

/** A word start, for a case-insensitive Postgres regex: special characters escaped. */
export function wordPattern(word: string): string {
  return `(^|[^[:alnum:]])${word.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}`;
}

/** Whether `word` starts a word of `text`, ignoring case. */
export function matchesWord(text: string, word: string): boolean {
  const w = word.toLowerCase();
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .some((t) => t.startsWith(w));
}
