import type { ErrorCode } from './error-code';

/** Values in an error's wording; `xBn` is the Bengali form of `x`, where one exists. */
export type ErrorDetails = Record<string, string | number | boolean | null>;

/**
 * One of several things wrong with a request (`details.problems`), worded
 * like any error: the app reads code and details; message is the English.
 */
export interface Problem {
  code: ErrorCode;
  message: string;
  details?: ErrorDetails;
}

export function problem(
  code: ErrorCode,
  message: string,
  details?: ErrorDetails,
): Problem {
  return details ? { code, message, details } : { code, message };
}
