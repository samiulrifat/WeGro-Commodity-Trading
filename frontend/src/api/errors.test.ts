import { describe, expect, it } from 'vitest';
import { toApiError } from './errors';

describe('toApiError', () => {
  it('reads the backend error body', () => {
    expect(
      toApiError({
        status: 409,
        data: {
          statusCode: 409,
          error: 'Conflict',
          message: 'This payment reference was already used',
          code: 'PAYMENT_REF_ALREADY_USED',
          requestId: 'r-1',
        },
      }),
    ).toEqual({
      kind: 'conflict',
      status: 409,
      messages: ['This payment reference was already used'],
      code: 'PAYMENT_REF_ALREADY_USED',
      details: undefined,
      requestId: 'r-1',
    });
  });

  it('lists every validation message', () => {
    const e = toApiError({
      status: 400,
      data: {
        statusCode: 400,
        error: 'Bad Request',
        message: ['phone is too short', 'name is empty'],
      },
    });
    expect(e).toMatchObject({
      kind: 'invalid',
      messages: ['phone is too short', 'name is empty'],
    });
  });

  it('tells an unreachable node and a lost connection apart', () => {
    expect(
      toApiError({
        status: 503,
        data: {
          statusCode: 503,
          error: 'x',
          message: 'Blockchain node unavailable',
        },
      })?.kind,
    ).toBe('unavailable');
    expect(
      toApiError({ status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' })
        ?.kind,
    ).toBe('network');
    expect(toApiError(undefined)).toBeNull();
  });
});
