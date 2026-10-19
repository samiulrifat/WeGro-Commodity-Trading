import { Copy, MessageSquareText, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * A temporary password, shown this once: whether the SMS with it went out,
 * and if not, that it must be handed over. They choose their own when they
 * first sign in.
 */
export function TemporaryPassword({
  password,
  smsSent,
}: {
  password: string;
  smsSent: boolean;
}) {
  const { t } = useTranslation();
  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      toast.success(t('people.password.copied'));
    } catch {
      // No clipboard: the password stays selectable.
    }
  }
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <code className="rounded-md bg-muted px-4 py-2 font-mono text-xl tracking-wider select-all">
          {password}
        </code>
        <Button variant="outline" size="sm" onClick={() => void copy()}>
          <Copy /> {t('people.password.copy')}
        </Button>
      </div>
      {smsSent ? (
        <Alert polite>
          <MessageSquareText />
          <AlertDescription>{t('people.password.sent')}</AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <TriangleAlert />
          <AlertTitle>{t('people.password.notSent')}</AlertTitle>
          <AlertDescription>{t('people.password.handOver')}</AlertDescription>
        </Alert>
      )}
      <p className="text-sm text-muted-foreground">
        {t('people.password.once')}
      </p>
    </div>
  );
}
