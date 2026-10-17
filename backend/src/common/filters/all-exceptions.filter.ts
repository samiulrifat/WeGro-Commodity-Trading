import { STATUS_CODES } from 'node:http';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorCode } from '../errors/error-code';
import { redact } from '../utils/redact';

export interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  /** Why: an ErrorCode, or the contract's error name for a ledger refusal. */
  code: string;
  details?: Record<string, unknown>;
  path: string;
  requestId?: string;
  timestamp: string;
}

/**
 * One error shape for every failure. Expected errors (4xx) pass their message
 * through; anything unexpected becomes a plain 500 and is logged with the
 * request body redacted, so internals and personal data never leak.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'Something went wrong. Please try again.';
    let code: string | undefined;
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        error = exception.name;
      } else {
        const b = body as {
          message?: string | string[];
          error?: string;
          code?: string;
          details?: Record<string, unknown>;
        };
        message = b.message ?? exception.message;
        // As Nest words it for a plain message: "Unauthorized", "Conflict".
        error = b.error ?? STATUS_CODES[status] ?? exception.name;
        code = b.code;
        details = b.details;
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.path} -> ${status} [${req.id ?? '-'}] body=${JSON.stringify(redact(req.body))}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorBody = {
      statusCode: status,
      error,
      message,
      // Errors raised by the framework itself (unknown route, rate limit,
      // malformed JSON, oversized upload) get a general code for their status.
      code: code ?? fallbackCode(status),
      ...(details !== undefined && { details }),
      path: req.originalUrl ?? req.url,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };
    res.status(status).json(body);
  }
}

const FALLBACK: Partial<Record<number, ErrorCode>> = {
  400: ErrorCode.InvalidRequest,
  401: ErrorCode.SignInRequired,
  403: ErrorCode.Forbidden,
  404: ErrorCode.NotFound,
  409: ErrorCode.Conflict,
  413: ErrorCode.RequestTooLarge,
  415: ErrorCode.UnsupportedMediaType,
  422: ErrorCode.InvalidRequest,
  429: ErrorCode.TooManyRequests,
  503: ErrorCode.ServiceUnavailable,
};

function fallbackCode(status: number): ErrorCode {
  return (
    FALLBACK[status] ??
    (status >= 500 ? ErrorCode.ServerError : ErrorCode.InvalidRequest)
  );
}
