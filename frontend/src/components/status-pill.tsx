import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const pill = cva(
  'inline-flex h-7 min-w-24 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-bold whitespace-nowrap',
  {
    variants: {
      tone: {
        success: '',
        neutral: '',
        warning: '',
        danger: '',
      },
      /** Solid as in WeGro's tables; soft for quieter places. */
      appearance: { solid: '', soft: '' },
    },
    compoundVariants: [
      { tone: 'success', appearance: 'solid', class: 'bg-brand text-white' },
      { tone: 'neutral', appearance: 'solid', class: 'bg-neutral text-white' },
      {
        tone: 'warning',
        appearance: 'solid',
        class: 'bg-warning text-white',
      },
      { tone: 'danger', appearance: 'solid', class: 'bg-danger text-white' },
      {
        tone: 'success',
        appearance: 'soft',
        class: 'bg-success-soft text-success',
      },
      {
        tone: 'neutral',
        appearance: 'soft',
        class: 'bg-muted text-muted-foreground',
      },
      {
        tone: 'warning',
        appearance: 'soft',
        class: 'bg-warning-soft text-warning-on-soft',
      },
      {
        tone: 'danger',
        appearance: 'soft',
        class: 'bg-danger-soft text-danger-on-soft',
      },
    ],
    defaultVariants: { tone: 'neutral', appearance: 'solid' },
  },
);

interface StatusPillProps extends VariantProps<typeof pill> {
  children: ReactNode;
  className?: string;
}

/**
 * A status in words with a dot, never colour alone: people who cannot tell
 * the colours apart still read the label.
 */
export function StatusPill({
  tone,
  appearance,
  children,
  className,
}: StatusPillProps) {
  return (
    <span className={cn(pill({ tone, appearance }), className)}>
      <span aria-hidden className="size-2 rounded-full bg-current" />
      {children}
    </span>
  );
}
