import { CircleCheck, CircleX, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StepState = 'done' | 'waiting' | 'refused';

const ICON = { done: CircleCheck, waiting: Clock, refused: CircleX } as const;
const TONE = {
  done: 'text-brand',
  waiting: 'text-wegro-amber',
  refused: 'text-danger',
} as const;

interface StepIconProps {
  state: StepState;
  /** Read out instead of the icon, e.g. "Admin: approved". */
  label: string;
  className?: string;
}

/** One approval step: done, waiting or refused (as the AM/CRM/HOD columns). */
export function StepIcon({ state, label, className }: StepIconProps) {
  const Icon = ICON[state];
  return (
    <span className="inline-flex">
      <Icon aria-hidden className={cn('size-5', TONE[state], className)} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
