import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Two cards side by side on a phone, so the figure scales with the screen.
const valueTone = cva(
  'text-2xl leading-tight font-bold tracking-tight sm:text-4xl',
  {
    variants: {
      tone: {
        /** Totals and amounts to come (amber in WeGro's product). */
        total: 'text-warning-strong',
        /** Done, approved, collected. */
        positive: 'text-brand',
        /** Rejected, overdue, lost. */
        negative: 'text-danger',
        neutral: 'text-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

interface StatCardProps extends VariantProps<typeof valueTone> {
  /** Already formatted: "129", "657.7M BDT". */
  value: ReactNode;
  label: ReactNode;
  className?: string;
}

/** A headline figure with its label, as on WeGro's dashboards. */
export function StatCard({ value, label, tone, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1 rounded-lg border bg-card px-3 py-4 text-center sm:px-4 sm:py-5',
        className,
      )}
    >
      <div className={valueTone({ tone })}>{value}</div>
      <div className="text-sm font-semibold text-muted-foreground sm:text-base">
        {label}
      </div>
    </div>
  );
}
