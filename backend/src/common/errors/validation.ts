import {
  BadRequestException,
  ValidationPipe,
  type ValidationPipeOptions,
} from '@nestjs/common';
import { getMetadataStorage, type ValidationError } from 'class-validator';
import { ErrorCode } from './error-code';

/** What an input check found wrong with one field, for the app to word. */
export enum ValidationRule {
  Required = 'required',
  NotAllowed = 'notAllowed',
  Text = 'text',
  WholeNumber = 'wholeNumber',
  Number = 'number',
  YesNo = 'yesNo',
  Date = 'date',
  Id = 'id',
  OneOf = 'oneOf',
  Min = 'min',
  Max = 'max',
  MinLength = 'minLength',
  MaxLength = 'maxLength',
  Format = 'format',
  Url = 'url',
  List = 'list',
  ListMin = 'listMin',
  ListMax = 'listMax',
  Unique = 'unique',
  Object = 'object',
  /** Any other check. */
  Invalid = 'invalid',
}

/** class-validator's check names -> the rule the app words. */
const RULES: Record<string, ValidationRule> = {
  isDefined: ValidationRule.Required,
  whitelistValidation: ValidationRule.NotAllowed,
  isString: ValidationRule.Text,
  isInt: ValidationRule.WholeNumber,
  isNumber: ValidationRule.Number,
  isBoolean: ValidationRule.YesNo,
  isDateString: ValidationRule.Date,
  isIso8601: ValidationRule.Date,
  isUuid: ValidationRule.Id,
  isEnum: ValidationRule.OneOf,
  isIn: ValidationRule.OneOf,
  min: ValidationRule.Min,
  max: ValidationRule.Max,
  minLength: ValidationRule.MinLength,
  maxLength: ValidationRule.MaxLength,
  matches: ValidationRule.Format,
  isUrl: ValidationRule.Url,
  isArray: ValidationRule.List,
  arrayMinSize: ValidationRule.ListMin,
  arrayMaxSize: ValidationRule.ListMax,
  arrayUnique: ValidationRule.Unique,
  isObject: ValidationRule.Object,
  nestedValidation: ValidationRule.Object,
};

/** Rules whose first argument is the limit to show (at least 1, at most 200 ...). */
const WITH_LIMIT = new Set([
  ValidationRule.Min,
  ValidationRule.Max,
  ValidationRule.MinLength,
  ValidationRule.MaxLength,
  ValidationRule.ListMin,
  ValidationRule.ListMax,
]);

export interface FieldError {
  /** Path in the request body or query: slots, items.0.qty. */
  field: string;
  rule: ValidationRule;
  limit?: number;
}

/**
 * The global input check: unknown fields refused, values converted to their
 * types. A refusal is code INVALID_INPUT with every failed check in
 * details.fields; message keeps class-validator's English, one per check.
 */
export class InputValidationPipe extends ValidationPipe {
  constructor(options: ValidationPipeOptions = {}) {
    super(options);
    this.exceptionFactory = (errors) =>
      new BadRequestException({
        message: this.flattenValidationErrors(errors),
        code: ErrorCode.InvalidInput,
        details: { fields: fieldErrors(errors) },
      });
  }
}

export function fieldErrors(
  errors: readonly ValidationError[],
  parent = '',
): FieldError[] {
  const out: FieldError[] = [];
  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const checks = Object.keys(error.constraints ?? {});
    if (
      error.value === undefined &&
      checks.length > 0 &&
      !checks.includes('whitelistValidation')
    ) {
      // Missing altogether: one entry says so, whatever else it would fail.
      out.push({ field, rule: ValidationRule.Required });
    } else {
      for (const check of checks) {
        const rule = RULES[check] ?? ValidationRule.Invalid;
        const limit = WITH_LIMIT.has(rule) ? limitOf(error, check) : undefined;
        out.push(
          limit === undefined ? { field, rule } : { field, rule, limit },
        );
      }
    }
    if (error.children?.length) out.push(...fieldErrors(error.children, field));
  }
  return out;
}

/** The number a check was declared with, e.g. 200 for @MaxLength(200). */
function limitOf(error: ValidationError, check: string): number | undefined {
  const target = error.target?.constructor;
  if (!target) return undefined;
  const meta = getMetadataStorage()
    .getTargetValidationMetadatas(target, '', true, false)
    .find((m) => m.propertyName === error.property && m.name === check);
  const value: unknown = meta?.constraints?.[0];
  return typeof value === 'number' ? value : undefined;
}
