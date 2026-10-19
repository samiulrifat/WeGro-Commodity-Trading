import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DetailField } from '@/api/generated/participants';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { PersonDraft } from './person';
import { useDistrictOptions } from './use-district-options';

/**
 * A person's details, as many of them as `fields` lists, two to a row on
 * wider screens. `problems` are shown under their fields; `afterPhone` (a
 * code to confirm the number) goes right below the number.
 */
export function PersonFields({
  value,
  onChange,
  fields,
  problems,
  idPrefix,
  afterPhone,
}: {
  value: PersonDraft;
  onChange: (next: PersonDraft) => void;
  fields: readonly DetailField[];
  problems: Partial<Record<DetailField, string>>;
  idPrefix: string;
  afterPhone?: ReactNode;
}) {
  const { t } = useTranslation();
  const districts = useDistrictOptions();
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const set = (field: DetailField) => (v: string) =>
    onChange({ ...value, [field]: v });
  const id = (field: DetailField) => `${idPrefix}-${field}`;
  const common = (field: DetailField) => ({
    id: id(field),
    value: value[field],
    'aria-invalid': problems[field] ? true : undefined,
  });
  const has = (field: DetailField) => fields.includes(field);

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {has('fullName') && (
        <Labelled
          field="fullName"
          id={id('fullName')}
          problem={problems.fullName}
        >
          <Input
            {...common('fullName')}
            autoComplete="name"
            onChange={(e) => set('fullName')(e.target.value)}
          />
        </Labelled>
      )}
      {has('phone') && (
        <Labelled field="phone" id={id('phone')} problem={problems.phone}>
          <Input
            {...common('phone')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            onChange={(e) => set('phone')(e.target.value)}
          />
        </Labelled>
      )}
      {afterPhone && <div className="md:col-span-2">{afterPhone}</div>}
      {has('nid') && (
        <Labelled
          field="nid"
          id={id('nid')}
          problem={problems.nid}
          hint={t('person.nidHint')}
        >
          <Input
            {...common('nid')}
            inputMode="numeric"
            autoComplete="off"
            onChange={(e) => set('nid')(e.target.value)}
          />
        </Labelled>
      )}
      {has('dateOfBirth') && (
        <Labelled
          field="dateOfBirth"
          id={id('dateOfBirth')}
          problem={problems.dateOfBirth}
        >
          <Input
            {...common('dateOfBirth')}
            type="date"
            autoComplete="bday"
            max={today}
            onChange={(e) => set('dateOfBirth')(e.target.value)}
          />
        </Labelled>
      )}
      {has('district') && (
        <Labelled
          field="district"
          id={id('district')}
          problem={problems.district}
        >
          <Select
            items={districts}
            value={value.district || null}
            onValueChange={(v) => set('district')(v ?? '')}
          >
            <SelectTrigger
              id={id('district')}
              className="w-full"
              aria-invalid={problems.district ? true : undefined}
            >
              <SelectValue placeholder={t('person.chooseDistrict')} />
            </SelectTrigger>
            <SelectContent>
              {districts.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Labelled>
      )}
      {has('address') && (
        <Labelled
          field="address"
          id={id('address')}
          problem={problems.address}
          className="md:col-span-2"
        >
          <Textarea
            {...common('address')}
            rows={2}
            autoComplete="street-address"
            onChange={(e) => set('address')(e.target.value)}
          />
        </Labelled>
      )}
    </div>
  );
}

function Labelled({
  field,
  id,
  problem,
  hint,
  className,
  children,
}: {
  field: DetailField;
  id: string;
  problem: string | undefined;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Field data-invalid={problem ? true : undefined} className={className}>
      <FieldLabel htmlFor={id}>{t(`person.${field}`)}</FieldLabel>
      {children}
      {hint && !problem && <FieldDescription>{hint}</FieldDescription>}
      {problem && <FieldError>{problem}</FieldError>}
    </Field>
  );
}
