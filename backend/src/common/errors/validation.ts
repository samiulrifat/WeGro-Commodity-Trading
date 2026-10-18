import {
  BadRequestException,
  ValidationPipe,
  type ValidationPipeOptions,
} from '@nestjs/common';
import { getMetadataStorage, type ValidationError } from 'class-validator';
import { ErrorCode } from './error-code';

/** What an input check found wrong with one field, for the app to word. */
export enum ValidationRule {
  REQUIRED = 'required',
  NOT_ALLOWED = 'notAllowed',
  TEXT = 'text',
  WHOLE_NUMBER = 'wholeNumber',
  NUMBER = 'number',
  YES_NO = 'yesNo',
  DATE = 'date',
  ID = 'id',
  ONE_OF = 'oneOf',
  MIN = 'min',
  MAX = 'max',
  MIN_LENGTH = 'minLength',
  MAX_LENGTH = 'maxLength',
  FORMAT = 'format',
  URL = 'url',
  LIST = 'list',
  LIST_MIN = 'listMin',
  LIST_MAX = 'listMax',
  UNIQUE = 'unique',
  OBJECT = 'object',
  /** Any other check. */
  INVALID = 'invalid',
}

/** class-validator's check names -> the rule the app words. */
const RULES: Record<string, ValidationRule> = {
  isDefined: ValidationRule.REQUIRED,
  whitelistValidation: ValidationRule.NOT_ALLOWED,
  isString: ValidationRule.TEXT,
  isInt: ValidationRule.WHOLE_NUMBER,
  isNumber: ValidationRule.NUMBER,
  isBoolean: ValidationRule.YES_NO,
  isDateString: ValidationRule.DATE,
  isIso8601: ValidationRule.DATE,
  isUuid: ValidationRule.ID,
  isEnum: ValidationRule.ONE_OF,
  isIn: ValidationRule.ONE_OF,
  min: ValidationRule.MIN,
  max: ValidationRule.MAX,
  minLength: ValidationRule.MIN_LENGTH,
  maxLength: ValidationRule.MAX_LENGTH,
  matches: ValidationRule.FORMAT,
  isUrl: ValidationRule.URL,
  isArray: ValidationRule.LIST,
  arrayMinSize: ValidationRule.LIST_MIN,
  arrayMaxSize: ValidationRule.LIST_MAX,
  arrayUnique: ValidationRule.UNIQUE,
  isObject: ValidationRule.OBJECT,
  nestedValidation: ValidationRule.OBJECT,
};

/** Rules whose first argument is the limit to show (at least 1, at most 200 ...). */
const WITH_LIMIT = new Set([
  ValidationRule.MIN,
  ValidationRule.MAX,
  ValidationRule.MIN_LENGTH,
  ValidationRule.MAX_LENGTH,
  ValidationRule.LIST_MIN,
  ValidationRule.LIST_MAX,
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
        code: ErrorCode.INVALID_INPUT,
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
      out.push({ field, rule: ValidationRule.REQUIRED });
    } else {
      for (const check of checks) {
        const rule = RULES[check] ?? ValidationRule.INVALID;
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
