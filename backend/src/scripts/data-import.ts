/**
 * Imports WeGro's own records from a folder of CSV files.
 *
 *   npm run data:import -- <folder>              check everything, write nothing
 *   npm run data:import -- <folder> --apply      check, then bring it all in
 *
 * Optional: --admin-phone / --accounts-phone choose which verified admin and
 * Accounts person act for the import (default: the first one).
 *
 * Writes import-report-<time>.csv next to the files, and on --apply
 * credentials-<time>.csv with each new person's temporary password (readable
 * only by you; hand them out, then delete the file).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { toCsv } from '../common/csv';
import { Importer } from '../data/import/importer';
import { appContext, fail } from './app-context';

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      apply: { type: 'boolean', default: false },
      'admin-phone': { type: 'string' },
      'accounts-phone': { type: 'string' },
    },
  });
  const folder = positionals[0];
  if (!folder) fail('Usage: npm run data:import -- <folder> [--apply]');

  const app = await appContext();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    const importer = new Importer(app, {
      folder,
      adminPhone: values['admin-phone'],
      accountsPhone: values['accounts-phone'],
    });
    const problems = await importer.validate();
    if (problems.length > 0) {
      const report = join(folder, `import-report-${stamp}.csv`);
      writeFileSync(
        report,
        toCsv(
          ['file', 'line', 'id', 'problem'],
          problems.map((p) => [p.file, p.line || null, p.id, p.message]),
        ),
      );
      for (const p of problems.slice(0, 30)) {
        console.error(
          `${p.file}${p.line ? `:${p.line}` : ''}${p.id ? ` [${p.id}]` : ''}  ${p.message}`,
        );
      }
      if (problems.length > 30)
        console.error(`... and ${problems.length - 30} more`);
      fail(
        `${problems.length} problem(s); nothing was imported. Full list: ${report}`,
      );
    }
    if (!values.apply) {
      console.log('No problems found. Run again with --apply to import.');
      return;
    }

    const { outcomes, credentials } = await importer.apply();
    const report = join(folder, `import-report-${stamp}.csv`);
    writeFileSync(
      report,
      toCsv(
        ['file', 'line', 'id', 'result', 'message'],
        outcomes.map((o) => [o.file, o.line, o.id, o.result, o.message]),
      ),
    );
    if (credentials.length > 0) {
      const file = join(folder, `credentials-${stamp}.csv`);
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
        { mode: 0o600 },
      );
      console.log(
        `Temporary passwords: ${file} (hand them out, then delete it)`,
      );
    }
    const count = (r: string) => outcomes.filter((o) => o.result === r).length;
    console.log(
      `Imported ${count('imported')}, skipped ${count('skipped')}, failed ${count('failed')}. Report: ${report}`,
    );
    for (const o of outcomes
      .filter((x) => x.result === 'failed')
      .slice(0, 20)) {
      console.error(`${o.file}:${o.line} [${o.id}]  ${o.message}`);
    }
    if (count('failed') > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
