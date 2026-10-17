import type { OpenAPIObject } from '@nestjs/swagger';
import { LEDGER_ERROR_CODES } from '../../blockchain/errors/contract-errors';
import { ErrorCode } from '../errors/error-code';
import { ValidationRule } from '../errors/validation';

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

/**
 * Documents the error body every route can answer with (ErrorBody), and
 * publishes the code lists (ErrorCode, LedgerErrorCode, ValidationRule) so
 * the app can be checked to have wording for each one. Kept in components
 * rather than on each route, so generated clients do not repeat them per area.
 */
export function describeErrors(document: OpenAPIObject): OpenAPIObject {
  const schemas = (document.components ??= {}).schemas ?? {};
  document.components.schemas = schemas;
  schemas.ErrorCode = {
    type: 'string',
    enum: Object.values(ErrorCode),
    description:
      'Why the backend refused: worded in the app from code and details',
  };
  schemas.LedgerErrorCode = {
    type: 'string',
    enum: [...LEDGER_ERROR_CODES],
    description: 'Why the ledger itself refused: the contract error name',
  };
  schemas.ValidationRule = {
    type: 'string',
    enum: Object.values(ValidationRule),
  };
  schemas.FieldError = {
    type: 'object',
    required: ['field', 'rule'],
    properties: {
      field: { type: 'string', example: 'slots' },
      rule: ref('ValidationRule'),
      limit: { type: 'number', example: 1 },
    },
  };
  schemas.ErrorBody = {
    type: 'object',
    required: ['statusCode', 'error', 'message', 'code', 'path', 'timestamp'],
    properties: {
      statusCode: { type: 'integer', example: 409 },
      error: { type: 'string', example: 'Conflict' },
      message: {
        oneOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' } },
        ],
        description: 'English wording',
      },
      code: { oneOf: [ref('ErrorCode'), ref('LedgerErrorCode')] },
      details: {
        type: 'object',
        additionalProperties: true,
        description:
          'Values in the wording (xBn: the Bengali form of x); fields: FieldError[] for INVALID_INPUT; problems: [{ code, message, details }] for several at once',
      },
      path: { type: 'string' },
      requestId: { type: 'string' },
      timestamp: { type: 'string', format: 'date-time' },
    },
  };
  return document;
}
