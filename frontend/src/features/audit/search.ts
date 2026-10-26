import type { ActivitySearch } from './activity-page';
import { isHistoryType, OUTCOMES } from './audit-utils';
import type { HistorySearch } from './history-page';
import type { LogSearch } from './log-page';

type Raw = Record<string, unknown>;

const text = (v: unknown, max = 100) =>
  typeof v === 'string' && v.trim() !== '' ? v.slice(0, max) : undefined;
const pageOf = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 1 ? n : undefined;
};
const day = (v: unknown) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;

export const parseActivitySearch = (raw: Raw): ActivitySearch => ({
  type: isHistoryType(raw.type) ? raw.type : undefined,
  q: text(raw.q, 80),
  page: pageOf(raw.page),
});

export const parseHistorySearch = (raw: Raw): HistorySearch => ({
  order: raw.order === 'desc' ? 'desc' : undefined,
  page: pageOf(raw.page),
});

export const parseLogSearch = (raw: Raw): LogSearch => ({
  q: text(raw.q, 200),
  outcome: OUTCOMES.find((o) => o === raw.outcome),
  from: day(raw.from),
  to: day(raw.to),
  actorId:
    typeof raw.actorId === 'string' && /^[0-9a-f-]{36}$/i.test(raw.actorId)
      ? raw.actorId
      : undefined,
  actorName: text(raw.actorName, 120),
  page: pageOf(raw.page),
});
