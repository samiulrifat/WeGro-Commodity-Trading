import { applyDecorators } from '@nestjs/common';
import {
  ApiExtension,
  ApiOkResponse,
  ApiProduces,
  ApiProperty,
  type OpenAPIObject,
} from '@nestjs/swagger';

/** `meta` of a paged response, as ResponseEnvelopeInterceptor sends it. */
export class PageMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 57, description: 'Matching items on all pages' })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

const PAGED = 'x-paged';

/**
 * Marks a route that returns `Paginated`: its documented array becomes
 * `{ data: [...], meta }` in the document. Documentation only.
 */
export const ApiPaged = () => ApiExtension(PAGED, true);

/** A file response (photo, QR code, CSV) sent as is, without the envelope. */
export const ApiFile = (...types: string[]) =>
  applyDecorators(
    ApiProduces(...types),
    ApiOkResponse({
      content: Object.fromEntries(
        types.map((t) => [t, { schema: { type: 'string', format: 'binary' } }]),
      ),
    }),
  );

type Schema = Record<string, unknown>;

/**
 * Makes the document say what ResponseEnvelopeInterceptor really sends:
 * every JSON success body is `{ data }`, and a paged one `{ data, meta }`.
 * Files and empty (204) answers are left as they are.
 */
export function describeEnvelopes(document: OpenAPIObject): OpenAPIObject {
  for (const item of Object.values(document.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const op = item[method] as
        | (Record<string, unknown> & {
            responses: Record<string, { content?: Record<string, Schema> }>;
          })
        | undefined;
      if (!op) continue;
      const paged = op[PAGED] === true;
      for (const [status, response] of Object.entries(op.responses)) {
        const json = response.content?.['application/json'];
        if (!status.startsWith('2') || !json?.schema) continue;
        json.schema = paged
          ? {
              type: 'object',
              required: ['data', 'meta'],
              properties: {
                data: json.schema,
                meta: { $ref: '#/components/schemas/PageMetaDto' },
              },
            }
          : {
              type: 'object',
              required: ['data'],
              properties: { data: json.schema },
            };
      }
    }
  }
  return document;
}
