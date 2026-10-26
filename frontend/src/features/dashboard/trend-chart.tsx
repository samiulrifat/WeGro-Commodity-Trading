import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { columnPath, niceMax } from './chart-utils';

// Drawn in real pixels at the card's width, so text keeps its size.
const H = 180;
const PAD = { right: 8, top: 24, bottom: 24 };
const PLOT_H = H - PAD.top - PAD.bottom;
/** Axis and label text, in pixels. */
const TEXT = 12;

/** The element's width, followed as it changes (a fallback until measured). */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(200, Math.round(entry.contentRect.width)));
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return [ref, width] as const;
}
/** Bars stay thin: never wider than this, whatever the band. */
const BAR_MAX = 18;

/**
 * One measure over the last 12 months as columns: hover (or tap) a month
 * for its value, the latest month labelled, and the figures as a table
 * underneath for anyone who would rather read them.
 */
export function TrendChart({
  title,
  months,
  values,
  format,
  tick,
  month,
  monthLong,
  whole = false,
}: {
  title: string;
  /** "2026-03", oldest first. */
  months: readonly string[];
  values: readonly number[];
  /** A value in full: tooltip, label and table. */
  format: (v: number) => string;
  /** A short axis value: "1.2M". */
  tick: (v: number) => string;
  /** A short month for the axis: "Mar". */
  month: (m: string) => string;
  /** A month in full: "March 2026". */
  monthLong: (m: string) => string;
  /** Counts: only whole numbers on the axis. */
  whole?: boolean;
}) {
  const { t } = useTranslation();
  const [box, W] = useWidth(360);
  const [active, setActive] = useState<number | null>(null);
  const top = niceMax(Math.max(0, ...values));
  const ticks =
    whole && !Number.isInteger(top / 2) ? [0, top] : [0, top / 2, top];
  // Room on the left for the longest tick label ("৳৫০০ হাজার" is wide).
  const left = Math.ceil(
    Math.max(...ticks.map((v) => tick(v).length)) * TEXT * 0.62 + 10,
  );
  const band = (W - left - PAD.right) / Math.max(1, values.length);
  // Month labels sit far enough apart not to touch, counted back from the
  // latest (about 0.6 of the text size per character).
  const longest = Math.max(0, ...months.map((m) => month(m).length));
  const every = Math.max(1, Math.ceil((longest * TEXT * 0.6 + 8) / band));
  const bar = Math.min(BAR_MAX, band - 6);
  const y = (v: number) => PAD.top + PLOT_H - (Math.max(0, v) / top) * PLOT_H;
  const last = values.length - 1;
  const total = values.reduce((a, b) => a + b, 0);
  const shown = active ?? null;

  return (
    <figure className="grid gap-2 rounded-2xl border bg-card p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold">{title}</span>
        <span className="text-sm text-muted-foreground">
          {t('dashboard.trendTotal', { total: format(total) })}
        </span>
      </figcaption>
      <div ref={box} className="relative">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block max-w-full touch-manipulation"
          aria-hidden
        >
          {ticks.map((v) => (
            <g key={v}>
              <line
                x1={left}
                x2={W - PAD.right}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--border)"
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text
                x={left - 6}
                y={y(v)}
                dy="0.32em"
                textAnchor="end"
                fontSize={TEXT}
                fill="var(--muted-foreground)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {tick(v)}
              </text>
            </g>
          ))}
          {values.map((v, i) => {
            const x = left + i * band + (band - bar) / 2;
            const h = PAD.top + PLOT_H - y(v);
            return (
              <g key={months[i]}>
                {h > 0 && (
                  <path
                    d={columnPath(x, y(v), bar, h)}
                    fill={
                      shown === i
                        ? 'var(--wegro-green-800)'
                        : 'var(--wegro-green-500)'
                    }
                  />
                )}
                {i % every === last % every && (
                  <text
                    // Kept inside the chart: a long last month moves in.
                    x={Math.min(
                      x + bar / 2,
                      W -
                        PAD.right -
                        (month(months[i] ?? '').length * TEXT * 0.62) / 2,
                    )}
                    y={H - 6}
                    textAnchor="middle"
                    fontSize={TEXT}
                    fill="var(--muted-foreground)"
                  >
                    {month(months[i] ?? '')}
                  </text>
                )}
                {/* The whole band is the target: easier to hit than the bar. */}
                <rect
                  x={left + i * band}
                  y={PAD.top}
                  width={band}
                  height={PLOT_H}
                  fill="transparent"
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onClick={() => setActive(i)}
                />
              </g>
            );
          })}
          {last >= 0 && shown === null && (
            <text
              x={Math.min(
                W - PAD.right,
                left + last * band + band / 2 + bar / 2,
              )}
              y={y(values[last] ?? 0) - 6}
              textAnchor="end"
              fontSize={TEXT}
              fontWeight={600}
              fill="var(--foreground)"
            >
              {format(values[last] ?? 0)}
            </text>
          )}
        </svg>
        {shown !== null && (
          <output
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md whitespace-nowrap"
            style={{
              left: `${Math.min(
                85,
                Math.max(15, ((left + shown * band + band / 2) / W) * 100),
              )}%`,
            }}
          >
            <span className="block text-muted-foreground">
              {monthLong(months[shown] ?? '')}
            </span>
            <span className="font-semibold">{format(values[shown] ?? 0)}</span>
          </output>
        )}
      </div>
      <p className="sr-only">
        {t('dashboard.chartLabel', {
          title,
          latest: last >= 0 ? format(values[last] ?? 0) : '',
        })}
      </p>
      <details className="text-sm">
        <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">
          {t('dashboard.showFigures')}
        </summary>
        <table className="mt-2 w-full">
          <caption className="sr-only">{title}</caption>
          <tbody>
            {months.map((m, i) => (
              <tr key={m} className="border-t">
                <th scope="row" className="py-1 text-left font-normal">
                  {monthLong(m)}
                </th>
                <td className="py-1 text-right tabular-nums">
                  {format(values[i] ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
