import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import { RAW_RESPONSE } from '../decorators/raw-response.decorator';
import { Paginated, type PageMeta } from '../dto/pagination.dto';

export interface Envelope<T> {
  data: T;
  meta?: PageMeta;
}

/** Every successful response is `{ data }`, or `{ data, meta }` for a page. */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (raw) return next.handle();

    return next
      .handle()
      .pipe(
        map((body: unknown): Envelope<unknown> =>
          body instanceof Paginated
            ? { data: body.items, meta: body.meta }
            : { data: body ?? null },
        ),
      );
  }
}
