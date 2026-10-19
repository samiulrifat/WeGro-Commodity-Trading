import { cn } from '@/lib/utils';

/**
 * Two or three options side by side in the green pill of WeGro's sign-in
 * box (Email | Phone): the chosen one white, the others on green.
 */
export function SegmentedChoice<T extends string>({
  legend,
  options,
  value,
  onChange,
  className,
}: {
  legend: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <fieldset
      className={cn(
        'inline-flex shrink-0 gap-0.5 rounded-lg bg-nav-active p-1',
        className,
      )}
    >
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'min-h-9 min-w-16 rounded-md px-3 text-sm font-medium text-nav-active-foreground transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11',
              active ? 'bg-card shadow-sm' : 'hover:bg-card/40',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
