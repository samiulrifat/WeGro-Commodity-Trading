import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ApiError } from '@/api/errors';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { errorText } from '@/i18n/text';

/** A refusal from the server, in the reader's language, announced. */
export function FormError({ error }: { error: ApiError | null }) {
  const { i18n } = useTranslation();
  if (!error) return null;
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlert />
      <AlertDescription>{errorText(error, i18n)}</AlertDescription>
    </Alert>
  );
}
