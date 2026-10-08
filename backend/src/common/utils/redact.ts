/** Key fragments whose values never reach the logs (matched case-insensitively). */
const SENSITIVE_KEYS = [
  'password',
  'secret',
  'token',
  'authorization',
  'cookie',
  'mnemonic',
  'privatekey',
  'paymentref',
  'bankaccount',
  'nationalid',
  'nid',
  'phone',
  'email',
];

const MAX_DEPTH = 6;

export function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[^a-z]/g, '');
  return SENSITIVE_KEYS.some((s) => k.includes(s));
}

/** A copy of `value` safe to log: sensitive fields become "[REDACTED]". */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        isSensitiveKey(k) ? '[REDACTED]' : redact(v, depth + 1),
      ]),
    );
  }
  return value;
}
