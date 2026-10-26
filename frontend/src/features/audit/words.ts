import { useTranslation } from 'react-i18next';
import { humanize } from './audit-utils';

type T = (key: string, values?: Record<string, unknown>) => string;

/**
 * Ledger words in the reader's language: event names, kinds of record and
 * what a check found different. A name the app has no words for yet (a
 * newer backend) reads as itself, split into words.
 */
export function useAuditWords() {
  const { t: typed, i18n } = useTranslation();
  const t = typed as unknown as T;
  const has = (key: string) => i18n.exists(key);
  const event = (name: string) =>
    has(`audit.event.${name}`) ? t(`audit.event.${name}`) : humanize(name);
  const recordType = (type: string) =>
    has(`audit.recordType.${type}`)
      ? t(`audit.recordType.${type}`)
      : humanize(type);
  /** "Status", or "Contents (the saved copy)" for a stale stored fingerprint. */
  const mismatch = (name: string): string => {
    if (has(`audit.mismatch.${name}`)) return t(`audit.mismatch.${name}`);
    const stored = /^(\w+)Stored$/.exec(name);
    if (stored?.[1]) {
      return t('audit.mismatch.stored', { what: mismatch(stored[1]) });
    }
    return humanize(name);
  };
  /** "Farhana Akter (Accounts)"; just the name when it is the role's own ("Super Admin"). */
  const actor = (name: string, role: string | undefined) => {
    const label = role && has(`roles.${role}`) ? t(`roles.${role}`) : '';
    return !role || label === name ? name : t('audit.byWho', { name, role });
  };
  return { event, recordType, mismatch, actor };
}
