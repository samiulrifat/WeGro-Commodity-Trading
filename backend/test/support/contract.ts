/**
 * Contract check for the chain tests: every JSON success response is
 * validated against the schema the OpenAPI document gives its route, so the
 * docs (and the frontend client generated from them) cannot drift from what
 * the API really sends. Test-only; the app itself is unchanged.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import type { NextFunction, Request, Response } from 'express';

export const CONTRACT_DIR = join(tmpdir(), 'wegro-contract');

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

export interface ContractCheck {
  /** Mismatches found so far, one line each. */
  failures: string[];
  /** Writes what was checked, for the run's coverage report. */
  save(label: string): void;
}

/** Adds the check in front of every route. Call before app.init(). */
export function installContractCheck(
  app: INestApplication,
  document: () => OpenAPIObject,
): ContractCheck {
  const failures: string[] = [];
  const checked = new Set<string>();
  const undocumented = new Set<string>();
  let doc: OpenAPIObject | undefined;
  const validators = new Map<string, ValidateFunction | null>();
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);

  const validatorFor = (
    key: string,
    method: string,
    path: string,
    status: number,
  ) => {
    const id = `${key} ${status}`;
    if (validators.has(id)) return validators.get(id) ?? null;
    doc ??= document();
    const op = doc.paths[path]?.[method as (typeof METHODS)[number]];
    const response = op?.responses[String(status)] as
      { content?: Record<string, { schema?: object }> } | undefined;
    const schema = response?.content?.['application/json']?.schema;
    // Refs point at '#/components/...': resolve them inside this root.
    const validate = schema
      ? ajv.compile(
          openApiNullable({ ...schema, components: doc.components }) as object,
        )
      : null;
    validators.set(id, validate);
    return validate;
  };

  app.use((req: Request, res: Response, next: NextFunction) => {
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      const route = (req.route as { path?: string } | undefined)?.path;
      if (route && res.statusCode >= 200 && res.statusCode < 300) {
        const method = req.method.toLowerCase();
        const path = route.replace(/:(\w+)/g, '{$1}');
        const key = `${req.method} ${path}`;
        const validate = validatorFor(key, method, path, res.statusCode);
        if (!validate) {
          undocumented.add(`${key} ${res.statusCode}`);
        } else {
          checked.add(key);
          // What the client receives: dates and the like as JSON.
          const sent: unknown = JSON.parse(JSON.stringify(body ?? null));
          if (!validate(sent)) {
            failures.push(
              `${key} ${res.statusCode}: ${ajv.errorsText(validate.errors, { separator: '; ' })}`,
            );
          }
        }
      }
      return json(body);
    };
    next();
  });

  return {
    failures,
    save(label) {
      doc ??= document();
      const all: string[] = [];
      for (const [path, item] of Object.entries(doc.paths)) {
        for (const m of METHODS) {
          const op = item[m] as
            { responses: Record<string, { content?: object }> } | undefined;
          const json =
            op &&
            Object.entries(op.responses).some(
              ([s, r]) =>
                s.startsWith('2') &&
                r.content &&
                'application/json' in r.content,
            );
          if (json) all.push(`${m.toUpperCase()} ${path}`);
        }
      }
      mkdirSync(CONTRACT_DIR, { recursive: true });
      writeFileSync(
        join(CONTRACT_DIR, `${label}.json`),
        JSON.stringify({
          all,
          checked: [...checked],
          undocumented: [...undocumented],
          failures,
        }),
      );
    },
  };
}

/**
 * OpenAPI 3.0's `nullable: true` means "this schema, or null" (Nest writes
 * nullable objects as `{ nullable, allOf: [$ref] }`); JSON Schema says it as
 * `anyOf: [null, schema]`. Ajv's own keyword only widens `type`, so convert.
 */
function openApiNullable(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(openApiNullable);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) out[k] = openApiNullable(v);
  if (out.nullable !== true) return out;
  delete out.nullable;
  return { anyOf: [{ type: 'null' }, out] };
}
