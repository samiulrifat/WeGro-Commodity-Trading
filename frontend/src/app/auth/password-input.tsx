import { Eye, EyeOff } from 'lucide-react';
import { type ComponentProps, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';

/** A password field with a button to see what was typed (phones mistype). */
export function PasswordInput(
  props: Omit<ComponentProps<typeof Input>, 'type'>,
) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        className="pr-12"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('password.hide') : t('password.show')}
        aria-pressed={visible}
        className="absolute top-0 right-0 flex size-11 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}
