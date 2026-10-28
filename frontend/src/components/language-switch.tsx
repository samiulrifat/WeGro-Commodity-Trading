import { useTranslation } from 'react-i18next';
import { LANGUAGE_NAMES, LANGUAGES, type Language } from '@/i18n/languages';
import { cn } from '@/lib/utils';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { languageChosen } from '@/store/language-slice';

const SHORT: Record<Language, string> = { en: 'EN', bn: 'বাংলা' };

/**
 * EN | বাংলা. Switches the whole app at once; signed in, the choice is saved
 * to the person's account and follows them to other devices.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const { t } = useTranslation();
  const current = useAppSelector((s) => s.language.current);
  const dispatch = useAppDispatch();
  return (
    <fieldset
      className={cn(
        'inline-flex shrink-0 rounded-md border bg-background p-0.5',
        className,
      )}
    >
      <legend className="sr-only">{t('language.label')}</legend>
      {LANGUAGES.map((lang) => {
        const active = lang === current;
        return (
          <button
            key={lang}
            type="button"
            lang={lang}
            aria-pressed={active}
            onClick={() => {
              if (!active) dispatch(languageChosen(lang));
            }}
            className={cn(
              'min-h-10 min-w-11 rounded-[calc(var(--radius-md)-2px)] px-3 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {SHORT[lang]}
            {/* Heard as "EN, English": the name must hold the words shown. */}
            {SHORT[lang] !== LANGUAGE_NAMES[lang] && (
              <span className="sr-only">, {LANGUAGE_NAMES[lang]}</span>
            )}
          </button>
        );
      })}
    </fieldset>
  );
}
