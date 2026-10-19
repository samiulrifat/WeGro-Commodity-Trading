import { Search, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * A list's search: type, then Find (or Enter). Every section's list has one,
 * so any record can be found, not only browsed. `value` is what the list is
 * searching for now (from the address); clearing it shows everything again.
 */
export function SearchBox({
  value,
  onSearch,
  placeholder,
  className,
}: {
  value: string | undefined;
  onSearch: (q: string | undefined) => void;
  placeholder: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(value ?? '');

  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch(text.trim() || undefined);
  }

  return (
    <search className={cn('flex gap-2', className)}>
      <form onSubmit={submit} className="flex flex-1 gap-2">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label={placeholder}
            placeholder={placeholder}
            value={text}
            className="pl-9"
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline">
          {t('search.find')}
        </Button>
      </form>
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('search.clear')}
          onClick={() => {
            setText('');
            onSearch(undefined);
          }}
        >
          <X />
        </Button>
      )}
    </search>
  );
}
