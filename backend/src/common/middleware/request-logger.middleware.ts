import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

const logger = new Logger('HTTP');

/**
 * Gives every request an id (kept from the caller if sent) and logs one line
 * when it finishes: method, path, status, duration. Runs before guards, so
 * rejected and unknown requests are logged too. Bodies are never logged here.
 */
export function requestLogger(
  req: Request & { id?: string },
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  req.id =
    typeof incoming === 'string' && /^[\w-]{1,64}$/.test(incoming)
      ? incoming
      : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, req.id);

  const started = Date.now();
  res.on('finish', () => {
    logger.log(
      `${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms [${req.id}]`,
    );
  });
  next();
}
