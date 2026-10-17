import logo from '@/assets/brand/wegro-logo.svg';
import logoOnDark from '@/assets/brand/wegro-logo-on-dark.svg';
import mark from '@/assets/brand/wegro-mark.svg';
import { cn } from '@/lib/utils';

interface LogoProps {
  /** The full wordmark, or the leafed "O" alone for tight spaces. */
  variant?: 'full' | 'mark';
  /** On a dark or brand-green background: the wordmark's green turns white. */
  onDark?: boolean;
  className?: string;
}

export function Logo({ variant = 'full', onDark, className }: LogoProps) {
  const src = variant === 'mark' ? mark : onDark ? logoOnDark : logo;
  return (
    <img
      src={src}
      alt="WeGro"
      className={cn(variant === 'mark' ? 'size-8' : 'h-8 w-auto', className)}
    />
  );
}
