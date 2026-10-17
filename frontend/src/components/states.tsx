import { Inbox, type LucideIcon, RotateCw, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiError } from '@/api/errors';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { errorText } from '@/i18n/text';
import { cn } from '@/lib/utils';

/** While something loads: announced to screen readers, never a blank page. */
export function LoadingState({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <output
      aria-live="polite"
      className={cn(
        'flex min-h-40 items-center justify-center gap-3 text-muted-foreground',
        className,
      )}
    >
      <Spinner aria-hidden className="size-5" role="presentation" />
      {t('states.loading')}
    </output>
  );
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

/** A list or page with nothing in it yet, saying so plainly. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: EmptyStateProps) {
  const { t } = useTranslation();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title ?? t('states.empty')}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

/**
 * A failure in the reader's language, with the reference to quote when
 * reporting it, and a retry where trying again can help.
 */
export function ErrorState({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry?: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="text-danger">
          <TriangleAlert />
        </EmptyMedia>
        <EmptyTitle role="alert">{errorText(error, i18n)}</EmptyTitle>
        {error.requestId && (
          <EmptyDescription>
            {t('states.reference', { id: error.requestId })}
          </EmptyDescription>
        )}
      </EmptyHeader>
      {onRetry && (
        <EmptyContent>
          <Button variant="outline" onClick={onRetry}>
            <RotateCw /> {t('states.retry')}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
