import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toCsv } from '../common/csv';
import type { Credential } from './import/importer';

/**
 * Writes people's one-time passwords to `<folder>/<prefix>-<time>.csv`,
 * readable only by the current user. Returns the path. Whoever runs the
 * import hands the passwords out, then deletes the file.
 */
export function writeCredentials(
  folder: string,
  prefix: string,
  credentials: Credential[],
): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(folder, `${prefix}-${stamp}.csv`);
  writeFileSync(
    file,
    toCsv(
      ['id', 'role', 'full_name', 'phone', 'temporary_password'],
      credentials.map((c) => [
        c.id,
        c.role,
        c.fullName,
        c.phone,
        c.temporaryPassword,
      ]),
    ),
    // Never readable by others; never overwrites an existing file.
    { mode: 0o600, flag: 'wx' },
  );
  return file;
}
