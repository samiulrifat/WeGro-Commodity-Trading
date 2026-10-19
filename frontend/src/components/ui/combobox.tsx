'use client';

import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { cn } from 'cn';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';

export interface ComboboxOption {
  value: string;
  label: string;
}

/**
 * A dropdown you can type into to narrow it: for long lists (banks,
 * branches). One value, by its id; the label is what is shown and searched.
 */
function SearchSelect({
  id,
  options,
  value,
  onValueChange,
  placeholder,
  emptyText,
  disabled,
  invalid,
  className,
}: {
  id?: string;
  options: readonly ComboboxOption[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  emptyText: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  const items = React.useMemo(
    () =>
      Combobox.createItems(options as ComboboxOption[], {
        getValue: (o) => o.value,
        getLabel: (o) => o.label,
      }),
    [options],
  );
  return (
    <Combobox.Root
      items={items}
      value={value}
      onValueChange={(v) => onValueChange(v ?? null)}
      disabled={disabled}
      autoHighlight
    >
      <Combobox.InputGroup
        data-slot="combobox-input-group"
        className={cn(
          'relative flex h-10 w-full items-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-disabled:cursor-not-allowed has-disabled:opacity-50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 pointer-coarse:h-11 dark:bg-input/30',
          className,
        )}
      >
        <Combobox.Input
          id={id}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          className="h-full w-full min-w-0 rounded-md bg-transparent pr-9 pl-2.5 text-sm outline-none placeholder:text-muted-foreground pointer-coarse:text-base"
        />
        <Combobox.Trigger
          aria-label={placeholder}
          className="absolute right-0 flex h-full w-9 items-center justify-center text-muted-foreground"
        >
          <ChevronDownIcon className="size-4" />
        </Combobox.Trigger>
      </Combobox.InputGroup>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="isolate z-50">
          <Combobox.Popup
            data-slot="combobox-content"
            className="w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            <Combobox.Empty className="px-3 py-4 text-sm text-muted-foreground empty:hidden">
              {emptyText}
            </Combobox.Empty>
            <Combobox.List className="max-h-[min(20rem,var(--available-height))] scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:p-0">
              {(option: ComboboxOption) => (
                <Combobox.Item
                  key={option.value}
                  value={option.value}
                  className="relative flex min-h-9 cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground pointer-coarse:min-h-11"
                >
                  <span className="flex-1">{option.label}</span>
                  <Combobox.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center">
                    <CheckIcon className="size-4" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

export { SearchSelect };
