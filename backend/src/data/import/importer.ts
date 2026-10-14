import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplicationContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource, In } from 'typeorm';
import { ContractsRegistry } from '../../blockchain/contracts.registry';
import {
  hashPaymentRef,
  normalisePaymentRef,
} from '../../blockchain/utils/payment-ref';
import { takaToPoisha } from '../../blockchain/utils/money';
import { bdDate } from '../../common/time/bd-dates';
import type { EnvironmentVariables } from '../../config/env.validation';
import type { AuthUser } from '../../modules/auth/auth-user';
import { CatalogService } from '../../modules/catalog/catalog.service';
import {
  nidIdentity,
  normaliseNid,
  normalisePhone,
  runIdCheck,
} from '../../modules/participants/id-check/id-check';
import { ParticipantsService } from '../../modules/participants/participants.service';
import { Project } from '../../modules/projects/entities/project.entity';
import {
  checkTerms,
  DEFAULT_SPLIT,
} from '../../modules/projects/project-terms';
import { ProjectStage } from '../../modules/projects/project.enums';
import { ProjectsService } from '../../modules/projects/projects.service';
import { ReservationsService } from '../../modules/projects/reservations.service';
import { LegacyProject } from '../../modules/track-record/entities/legacy-project.entity';
import { PersonalDetails } from '../../modules/users/entities/personal-details.entity';
import { User } from '../../modules/users/entities/user.entity';
import { PersonalDetailsCodec } from '../../modules/users/personal-details.codec';
import {
  ParticipantStatus,
  Role,
  STAFF_ROLES,
} from '../../modules/users/roles';
import { CsvFormatError, type CsvRow, readCsv } from '../csv-read';
import { ImportRecord } from '../entities/import-record.entity';
import {
  type HistoryRow,
  IMPORT_FILES,
  type ImportFile,
  type InvestmentRow,
  type PersonRow,
  type ProjectRow,
} from './import-files';

export interface ImportProblem {
  file: string;
  line: number;
  id: string | null;
  message: string;
}

export interface ImportOutcome {
  file: string;
  line: number;
  id: string;
  result: 'imported' | 'skipped' | 'failed';
  message: string;
}

export interface Credential {
  id: string;
  role: string;
  fullName: string;
  phone: string;
  temporaryPassword: string;
}

/** A parsed row: WeGro's id, the DTO-shaped values, and where it came from. */
interface Row {
  spec: ImportFile;
  line: number;
  id: string;
  data: Record<string, unknown>;
}

const PLACEHOLDER_UUID = '00000000-0000-4000-8000-000000000000';

/**
 * Brings WeGro's own records in through the platform's rules: people are
 * ID-checked, registered and verified on the ledger with the right keys,
 * projects are created and published, investments reserved and confirmed,
 * and finished history stored off the ledger.
 *
 *   validate()  checks every file and row and reports every problem; nothing
 *               is written. apply() refuses to start unless this is clean.
 *   apply()     brings the rows in, in dependency order. Each row imported is
 *               recorded by WeGro's id, so running again skips it: a stopped
 *               import resumes where it left off.
 *
 * Validation reads each file once and checks duplicates with hash maps; the
 * database is asked once per kind for what was imported before.
 */
export class Importer {
  private readonly ds: DataSource;
  private readonly catalog: CatalogService;
  private readonly codec: PersonalDetailsCodec;
  private readonly paymentSecret: string;
  private readonly contracts: ContractsRegistry;
  private rows: Row[] = [];
  /** kind -> WeGro id -> platform id, from earlier runs. */
  private done = new Map<string, Map<string, string>>();

  constructor(
    private readonly app: INestApplicationContext,
    private readonly opts: {
      folder: string;
      adminPhone?: string;
      accountsPhone?: string;
    },
  ) {
    this.ds = app.get(DataSource);
    this.catalog = app.get(CatalogService, { strict: false });
    this.codec = app.get(PersonalDetailsCodec, { strict: false });
    this.contracts = app.get(ContractsRegistry, { strict: false });
    this.paymentSecret = app
      .get<ConfigService<EnvironmentVariables, true>>(ConfigService)
      .get('PAYMENT_REF_SECRET', { infer: true });
  }

  // --- Validation (dry run) ---------------------------------------------------

  async validate(): Promise<ImportProblem[]> {
    const problems: ImportProblem[] = [];
    const add = (
      file: string,
      line: number,
      id: string | null,
      message: string,
    ) => problems.push({ file, line, id, message });
    this.rows = [];

    // Files: known names only, known and required columns, unique ids.
    if (!existsSync(this.opts.folder)) {
      add(this.opts.folder, 0, null, 'folder not found');
      return problems;
    }
    const present = new Set(
      readdirSync(this.opts.folder).filter(
        (f) => f.endsWith('.csv') && !isOutput(f),
      ),
    );
    for (const f of present) {
      if (!IMPORT_FILES.some((s) => s.file === f)) {
        add(
          f,
          0,
          null,
          `unknown file; expected one of ${IMPORT_FILES.map((s) => s.file).join(', ')}`,
        );
      }
    }
    for (const spec of IMPORT_FILES) {
      if (!present.has(spec.file)) continue;
      let parsed: { headers: string[]; rows: CsvRow[] };
      try {
        parsed = readCsv(
          readFileSync(join(this.opts.folder, spec.file), 'utf8'),
        );
      } catch (error) {
        if (!(error instanceof CsvFormatError)) throw error;
        add(spec.file, error.line, null, error.reason);
        continue;
      }
      const unknown = parsed.headers.filter((h) => !(h in spec.columns));
      if (unknown.length)
        add(spec.file, 1, null, `unknown column(s): ${unknown.join(', ')}`);
      const missing = spec.required.filter((c) => !parsed.headers.includes(c));
      if (missing.length) {
        add(spec.file, 1, null, `missing column(s): ${missing.join(', ')}`);
        continue;
      }
      const ids = new Map<string, number>();
      for (const r of parsed.rows) {
        const id = r.values[spec.idColumn];
        const empty = spec.required.filter((c) => !r.values[c]);
        if (empty.length)
          add(spec.file, r.line, id || null, `empty: ${empty.join(', ')}`);
        if (!id) continue;
        if (ids.has(id)) {
          add(spec.file, r.line, id, `id also on line ${ids.get(id)}`);
          continue;
        }
        ids.set(id, r.line);
        const data = this.convert(spec, r, (m) =>
          add(spec.file, r.line, id, m),
        );
        if (data) this.rows.push({ spec, line: r.line, id, data });
      }
    }
    await this.loadDone();

    // Each row against the API's own DTO (refs replaced by placeholders).
    for (const row of this.rows) {
      const plain = { ...row.data };
      delete plain[row.spec.columns[row.spec.idColumn][0]];
      for (const col of Object.keys(row.spec.refs ?? {})) {
        const key = row.spec.columns[col][0];
        if (plain[key] !== undefined) plain[key] = PLACEHOLDER_UUID;
      }
      const errors = await validate(plainToInstance(row.spec.dto, plain), {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      for (const e of errors.flatMap(flatten))
        add(row.spec.file, row.line, row.id, e);
    }

    // References, uniqueness and the business rules of each kind.
    const byKind = (kind: string) =>
      this.rows.filter((r) => r.spec.kind === kind);
    const people = new Map(
      byKind('person').map((r) => [r.id, r.data as unknown as PersonRow]),
    );
    const projects = new Map(
      byKind('project').map((r) => [r.id, r.data as unknown as ProjectRow]),
    );
    const doneRoles = await this.importedRoles();
    const roleOf = (id: string) => people.get(id)?.role ?? doneRoles.get(id);
    const ref = (row: Row, col: string, kind: string, roles?: Role[]) => {
      const value = row.data[row.spec.columns[col][0]];
      if (typeof value !== 'string' || !value) return;
      const known =
        (kind === 'person' && people.has(value)) ||
        (kind === 'project' && projects.has(value)) ||
        this.done.get(kind)?.has(value);
      if (!known) {
        add(
          row.spec.file,
          row.line,
          row.id,
          `${col} "${value}" is not in ${kind === 'person' ? 'people.csv' : 'projects.csv'} or an earlier import`,
        );
      } else if (roles && kind === 'person') {
        const role = roleOf(value) as Role | undefined;
        if (role && !roles.includes(role)) {
          add(
            row.spec.file,
            row.line,
            row.id,
            `${col} "${value}" is a ${role}, not a ${roles.join(' or ')}`,
          );
        }
      }
    };

    await this.checkPeople(byKind('person'), add, ref);
    this.checkCatalog(byKind('produce-type'), byKind('input-type'), add);
    const produce = this.produceCategories();
    for (const row of byKind('project')) {
      const p = row.data as unknown as ProjectRow;
      ref(row, 'farmer_id', 'person', [Role.Farmer]);
      const category = produce.get(p.produceCode);
      if (!category)
        add(
          row.spec.file,
          row.line,
          row.id,
          `produce_code "${p.produceCode}" is not in the catalog`,
        );
      try {
        for (const problem of checkTerms(termsOf(p, category ?? ''))) {
          add(row.spec.file, row.line, row.id, problem);
        }
      } catch {
        // Malformed money is already reported by the DTO.
      }
    }
    await this.checkInvestments(byKind('investment'), projects, add, ref);
    for (const row of byKind('history')) {
      const h = row.data as unknown as HistoryRow;
      ref(row, 'farmer_id', 'person', [Role.Farmer]);
      if (!produce.has(h.produceCode))
        add(
          row.spec.file,
          row.line,
          row.id,
          `produce_code "${h.produceCode}" is not in the catalog`,
        );
      if (h.finishedOn && h.startedOn && h.finishedOn < h.startedOn)
        add(
          row.spec.file,
          row.line,
          row.id,
          'finished_on is before started_on',
        );
      if (h.finishedOn > bdDate(new Date()))
        add(row.spec.file, row.line, row.id, 'finished_on is in the future');
    }
    await this.checkActors(add);
    return problems.sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
    );
  }

  private convert(
    spec: ImportFile,
    r: CsvRow,
    problem: (m: string) => void,
  ): Record<string, unknown> | null {
    const data: Record<string, unknown> = {};
    let ok = true;
    for (const [col, raw] of Object.entries(r.values)) {
      if (raw === '') continue;
      const [key, cell] = spec.columns[col];
      if (cell === 'int') data[key] = /^-?\d+$/.test(raw) ? Number(raw) : raw;
      else if (cell === 'bool') {
        const v = raw.toLowerCase();
        data[key] = ['true', 'yes', '1'].includes(v)
          ? true
          : ['false', 'no', '0'].includes(v)
            ? false
            : raw;
      } else if (cell === 'json') {
        try {
          data[key] = JSON.parse(raw);
        } catch {
          problem(`${col} is not valid JSON`);
          ok = false;
        }
      } else data[key] = raw;
    }
    return ok ? data : null;
  }

  private async checkPeople(
    rows: Row[],
    add: (f: string, l: number, id: string | null, m: string) => void,
    ref: (row: Row, col: string, kind: string, roles?: Role[]) => void,
  ) {
    const phones = new Map<string, string>();
    const nids = new Map<string, string>();
    const pending: Array<{
      row: Row;
      phone: string | null;
      nid: string | null;
    }> = [];
    for (const row of rows) {
      const p = row.data as unknown as PersonRow;
      const file = row.spec.file;
      if (String(p.role) === Role.SuperAdmin) {
        add(
          file,
          row.line,
          row.id,
          'the super admin is created by the reset or user:super-admin, not imported',
        );
        continue;
      }
      if (p.fieldOfficerId) {
        if (p.role !== Role.Farmer)
          add(file, row.line, row.id, 'only farmers have a field officer');
        else ref(row, 'field_officer_id', 'person', [Role.FieldOfficer]);
      }
      const report = runIdCheck({
        fullName: String(p.fullName ?? ''),
        phone: String(p.phone ?? ''),
        nid: String(p.nid ?? ''),
        dateOfBirth: String(p.dateOfBirth ?? ''),
        district: String(p.district ?? ''),
        address: String(p.address ?? ''),
      });
      for (const c of report.checks.filter((x) => x.result === 'fail')) {
        add(file, row.line, row.id, `ID check ${c.code}: ${c.message}`);
      }
      const flags = report.checks.filter((x) => x.result === 'warn');
      if (flags.length && !p.acknowledgeFlags) {
        add(
          file,
          row.line,
          row.id,
          `ID check flagged ${flags.map((f) => f.code).join(', ')}: review, then set acknowledge_flags to true`,
        );
      }
      if (this.done.get('person')?.has(row.id)) continue; // already in: no duplicate check
      // Each checked on its own: a bad phone must not hide a repeated NID.
      const phone = normalisePhone(String(p.phone ?? ''));
      const nid = normaliseNid(String(p.nid ?? ''));
      for (const [map, key, what] of [
        [phones, phone, 'phone'],
        [nids, nid && nidIdentity(nid), 'NID'],
      ] as const) {
        if (!key) continue;
        const other = map.get(key);
        if (other)
          add(file, row.line, row.id, `same ${what} as person ${other}`);
        else map.set(key, row.id);
      }
      pending.push({ row, phone, nid });
    }
    // Already registered here: one query each.
    const phoneOf = new Map(
      pending.flatMap((x) =>
        x.phone ? [[x, this.codec.phoneIndex(x.phone)] as const] : [],
      ),
    );
    const nidOf = new Map(
      pending.flatMap((x) =>
        x.nid ? [[x, this.codec.nidIndex(x.nid)] as const] : [],
      ),
    );
    if (phoneOf.size === 0 && nidOf.size === 0) return;
    const [byPhone, byNid] = await Promise.all([
      phoneOf.size
        ? this.ds.getRepository(User).find({
            where: { phoneIndex: In([...phoneOf.values()]) },
            select: { phoneIndex: true },
          })
        : [],
      nidOf.size
        ? this.ds.getRepository(PersonalDetails).find({
            where: { nidIndex: In([...nidOf.values()]) },
            select: { nidIndex: true },
          })
        : [],
    ]);
    const takenPhones = new Set(byPhone.map((u) => u.phoneIndex));
    const takenNids = new Set(byNid.map((d) => d.nidIndex));
    for (const x of pending) {
      const { file } = x.row.spec;
      if (takenPhones.has(phoneOf.get(x)!))
        add(file, x.row.line, x.row.id, 'phone is already registered');
      if (takenNids.has(nidOf.get(x)!))
        add(file, x.row.line, x.row.id, 'NID is already registered');
    }
  }

  /** Units and produce named by catalog rows exist in the catalog or the files. */
  private checkCatalog(
    produceRows: Row[],
    inputRows: Row[],
    add: (f: string, l: number, id: string | null, m: string) => void,
  ) {
    const units = new Set([
      ...this.rows.filter((r) => r.spec.kind === 'unit').map((r) => r.id),
      ...this.catalog.bundle(true).units.map((u) => u.code),
    ]);
    for (const row of [...produceRows, ...inputRows]) {
      const unit =
        typeof row.data.unitCode === 'string' ? row.data.unitCode : '';
      if (unit && !units.has(unit))
        add(
          row.spec.file,
          row.line,
          row.id,
          `unit_code "${unit}" is not in the catalog or units.csv`,
        );
    }
    const produce = this.produceCategories();
    for (const row of inputRows) {
      const code = row.data.produceCode;
      if (typeof code === 'string' && !produce.has(code))
        add(
          row.spec.file,
          row.line,
          row.id,
          `produce_code "${code}" is not in the catalog or produce-types.csv`,
        );
    }
  }

  private async checkInvestments(
    rows: Row[],
    projects: Map<string, ProjectRow>,
    add: (f: string, l: number, id: string | null, m: string) => void,
    ref: (row: Row, col: string, kind: string, roles?: Role[]) => void,
  ) {
    const refs = new Map<string, string>();
    const slots = new Map<string, number>();
    for (const row of rows) {
      const inv = row.data as unknown as InvestmentRow;
      ref(row, 'project_id', 'project');
      ref(row, 'investor_id', 'person', [Role.Investor]);
      if (this.done.get('investment')?.has(row.id)) continue;
      const p = projects.get(inv.projectId);
      if (p && (p.stage ?? 'open_for_funding') === 'draft')
        add(
          row.spec.file,
          row.line,
          row.id,
          `project ${inv.projectId} stays a draft: it cannot take investments`,
        );
      if (typeof inv.slots === 'number')
        slots.set(inv.projectId, (slots.get(inv.projectId) ?? 0) + inv.slots);
      try {
        const key = normalisePaymentRef(String(inv.paymentReference));
        const other = refs.get(key);
        if (other)
          add(
            row.spec.file,
            row.line,
            row.id,
            `payment_reference also used by investment ${other}`,
          );
        else refs.set(key, row.id);
      } catch {
        // Length is reported by the DTO.
      }
    }
    // Earlier uses of the same references: here, or on the ledger (which
    // remembers them even when this database was emptied).
    if (refs.size) {
      const hashes = new Map(
        [...refs.keys()].map((r) => [r, hashPaymentRef(r, this.paymentSecret)]),
      );
      const used: Array<{ payment_ref_hash: string }> = await this.ds.query(
        'SELECT payment_ref_hash FROM reservations WHERE payment_ref_hash = ANY($1)',
        [[...hashes.values()]],
      );
      const usedSet = new Set(used.map((u) => u.payment_ref_hash.trim()));
      const ledger = this.contracts.get('ProjectLedger');
      const unknown = [...hashes.values()].filter((h) => !usedSet.has(h));
      for (let i = 0; i < unknown.length; i += 50) {
        const batch = unknown.slice(i, i + 50);
        const onChain = await Promise.all(
          batch.map((h) => ledger.paymentRefUsed(h)),
        );
        batch.forEach((h, j) => onChain[j] && usedSet.add(h));
      }
      for (const [refText, id] of refs) {
        if (usedSet.has(hashes.get(refText)!)) {
          const row = rows.find((r) => r.id === id)!;
          add(
            row.spec.file,
            row.line,
            id,
            'payment_reference was already used for another payment',
          );
        }
      }
    }
    // Slots: no more than the project has; all of them for an active project.
    for (const [projectExt, p] of projects) {
      let total: number;
      let taken = 0;
      try {
        total = Number(
          takaToPoisha(String(p.fundingTarget)) /
            takaToPoisha(String(p.slotPrice)),
        );
      } catch {
        continue;
      }
      if (this.done.get('project')?.has(projectExt)) {
        const [row] = await this.ds.query<
          Array<{ issued: number; reserved: number }>
        >(
          'SELECT issued_slots AS issued, reserved_slots AS reserved FROM projects WHERE id = $1',
          [this.done.get('project')!.get(projectExt)],
        );
        taken = row ? row.issued + row.reserved : 0;
      }
      const wanted = taken + (slots.get(projectExt) ?? 0);
      const projectRow = this.rows.find(
        (r) => r.spec.kind === 'project' && r.id === projectExt,
      )!;
      if (wanted > total)
        add(
          'investments.csv',
          0,
          null,
          `project ${projectExt}: ${wanted} slots invested, but it has ${total}`,
        );
      if ((p.stage ?? 'open_for_funding') === 'active' && wanted !== total) {
        add(
          projectRow.spec.file,
          projectRow.line,
          projectExt,
          `stage active needs all ${total} slots invested; investments.csv has ${wanted}`,
        );
      }
    }
  }

  /** Someone must verify non-staff people, create projects and confirm payments. */
  private async checkActors(
    add: (f: string, l: number, id: string | null, m: string) => void,
  ) {
    const kinds = new Set(this.rows.map((r) => r.spec.kind));
    const people = this.rows.filter((r) => r.spec.kind === 'person');
    const nonStaff = people.some((r) => !STAFF_ROLES.has(r.data.role as Role));
    const has = async (role: Role, phone: string | undefined) =>
      people.some((r) => r.data.role === role) ||
      !!(await this.findStaff(role, phone, false));
    if (
      (nonStaff || kinds.has('project')) &&
      !(await has(Role.Admin, this.opts.adminPhone))
    ) {
      add(
        'people.csv',
        0,
        null,
        'no admin to verify people and create projects: add one to people.csv or pass --admin-phone',
      );
    }
    if (
      kinds.has('investment') &&
      !(await has(Role.Accounts, this.opts.accountsPhone))
    ) {
      add(
        'people.csv',
        0,
        null,
        'no Accounts person to confirm investments: add one to people.csv or pass --accounts-phone',
      );
    }
    if (
      people.some((r) => STAFF_ROLES.has(r.data.role as Role)) &&
      !(await this.superAdmin(false))
    ) {
      add(
        'people.csv',
        0,
        null,
        'staff are registered by the super admin, who does not exist yet: run npm run user:super-admin first',
      );
    }
  }

  // --- Apply -------------------------------------------------------------------

  /** Brings every row in. Call validate() first; refuses if it found problems. */
  async apply(): Promise<{
    outcomes: ImportOutcome[];
    credentials: Credential[];
  }> {
    const problems = await this.validate();
    if (problems.length)
      throw new Error(
        `${problems.length} problem(s) found; fix them and validate again`,
      );
    const outcomes: ImportOutcome[] = [];
    const credentials: Credential[] = [];
    const run = async (row: Row, work: () => Promise<string | null>) => {
      const done = this.done.get(row.spec.kind)?.get(row.id);
      if (done) {
        outcomes.push({
          file: row.spec.file,
          line: row.line,
          id: row.id,
          result: 'skipped',
          message: 'imported before',
        });
        return;
      }
      try {
        const internal = await work();
        if (internal === null) {
          outcomes.push({
            file: row.spec.file,
            line: row.line,
            id: row.id,
            result: 'skipped',
            message: 'already in the catalog',
          });
          return;
        }
        await this.ds.getRepository(ImportRecord).insert({
          kind: row.spec.kind,
          externalId: row.id,
          internalId: internal,
        });
        this.remember(row.spec.kind, row.id, internal);
        outcomes.push({
          file: row.spec.file,
          line: row.line,
          id: row.id,
          result: 'imported',
          message: '',
        });
      } catch (error) {
        outcomes.push({
          file: row.spec.file,
          line: row.line,
          id: row.id,
          result: 'failed',
          message: describe(error),
        });
      }
    };
    const rowsOf = (kind: string) =>
      this.rows.filter((r) => r.spec.kind === kind);
    const resolve = (kind: string, ext: string) => {
      const id = this.done.get(kind)?.get(ext);
      if (!id) throw new Error(`${kind} "${ext}" was not imported`);
      return id;
    };

    // Catalog.
    for (const row of rowsOf('unit'))
      await run(row, () =>
        this.catalogEntry('units', row, (d) => this.catalog.createUnit(d)),
      );
    for (const row of rowsOf('produce-type'))
      await run(row, () =>
        this.catalogEntry('produceTypes', row, (d) =>
          this.catalog.createProduceType(d),
        ),
      );
    for (const row of rowsOf('input-type'))
      await run(row, () =>
        this.catalogEntry('inputTypes', row, (d) =>
          this.catalog.createInputType(d),
        ),
      );
    for (const row of rowsOf('record-type'))
      await run(row, () =>
        this.catalogEntry('fieldRecordTypes', row, (d) =>
          this.catalog.createFieldRecordType(d),
        ),
      );
    for (const row of rowsOf('weather-type'))
      await run(row, () =>
        this.catalogEntry('weatherEventTypes', row, (d) =>
          this.catalog.createWeatherEventType(d),
        ),
      );

    // People: staff first (the super admin registers and verifies them), then
    // everyone else (a farmer by their field officer, others by an admin).
    const participants = this.app.get(ParticipantsService, { strict: false });
    const people = rowsOf('person');
    const isStaff = (r: Row) => STAFF_ROLES.has(r.data.role as Role);
    const superAdmin = await this.superAdmin(true);
    let admin: AuthUser | null = null;
    for (const row of [
      ...people.filter(isStaff),
      ...people.filter((r) => !isStaff(r)),
    ]) {
      await run(row, async () => {
        const p = row.data as unknown as PersonRow;
        let registrar = superAdmin!;
        if (!isStaff(row)) {
          admin ??= await this.adminActor();
          registrar = p.fieldOfficerId
            ? await this.actor(resolve('person', p.fieldOfficerId))
            : admin;
        }
        const res = await participants.register(registrar, {
          role: p.role,
          fullName: p.fullName,
          phone: p.phone,
          nid: p.nid,
          dateOfBirth: p.dateOfBirth,
          district: p.district,
          address: p.address,
        });
        const id = res.participant.id;
        await participants.verify(
          isStaff(row) ? superAdmin! : admin!,
          id,
          p.acknowledgeFlags ?? false,
        );
        credentials.push({
          id: row.id,
          role: p.role,
          fullName: p.fullName,
          phone: p.phone,
          temporaryPassword: res.temporaryPassword,
        });
        return id;
      });
    }

    // Projects: created and published by an admin; activated once funded.
    const projectsService = this.app.get(ProjectsService, { strict: false });
    const toActivate: string[] = [];
    for (const row of rowsOf('project')) {
      await run(row, async () => {
        const p = row.data as unknown as ProjectRow;
        admin ??= await this.adminActor();
        const { stage, ...dto } = p;
        delete (dto as Record<string, unknown>).id;
        const created = await projectsService.create(admin, {
          ...dto,
          farmerId: resolve('person', p.farmerId),
        });
        if ((stage ?? 'open_for_funding') !== 'draft')
          await projectsService.publish(admin, created.id);
        if (stage === 'active') toActivate.push(created.id);
        return created.id;
      });
    }

    // Investments: reserved by the investor, confirmed by Accounts.
    const reservations = this.app.get(ReservationsService, { strict: false });
    const accounts = rowsOf('investment').length
      ? await this.staffActor(Role.Accounts, this.opts.accountsPhone)
      : null;
    for (const row of rowsOf('investment')) {
      await run(row, async () => {
        const inv = row.data as unknown as InvestmentRow;
        const investor = await this.actor(resolve('person', inv.investorId));
        const reserved = await reservations.reserve(
          investor,
          resolve('project', inv.projectId),
          inv.slots,
        );
        await reservations.confirm(
          accounts!,
          reserved.id,
          inv.paymentReference,
        );
        return String(reserved.id);
      });
    }
    for (const projectId of toActivate) {
      const project = await this.ds
        .getRepository(Project)
        .findOneBy({ id: projectId });
      if (project?.stage === ProjectStage.Funded) {
        await projectsService
          .advance(admin!, projectId, 'activate')
          .catch((error: unknown) => {
            const row = rowsOf('project').find(
              (r) => this.done.get('project')?.get(r.id) === projectId,
            )!;
            outcomes.push({
              file: row.spec.file,
              line: row.line,
              id: row.id,
              result: 'failed',
              message: `activation: ${describe(error)}`,
            });
          });
      }
    }

    // Finished history, off the ledger.
    for (const row of rowsOf('history')) {
      await run(row, async () => {
        const h = row.data as unknown as HistoryRow;
        const id = randomUUID();
        await this.ds.getRepository(LegacyProject).insert({
          id,
          farmerId: resolve('person', h.farmerId),
          title: h.title,
          produceCode: h.produceCode,
          districtCode: h.districtCode,
          startedOn: h.startedOn,
          finishedOn: h.finishedOn,
          fundingRaised: takaToPoisha(h.fundingRaised),
          income: takaToPoisha(h.income),
          costs: takaToPoisha(h.costs),
          farmerReceived: takaToPoisha(h.farmerReceived),
          harvested: h.harvested ?? null,
          sold: h.sold ?? null,
          notes: h.notes ?? null,
        });
        return id;
      });
    }
    return { outcomes, credentials };
  }

  // --- Helpers -------------------------------------------------------------------

  private async catalogEntry(
    list:
      | 'units'
      | 'produceTypes'
      | 'inputTypes'
      | 'fieldRecordTypes'
      | 'weatherEventTypes',
    row: Row,
    create: (dto: never) => Promise<unknown>,
  ): Promise<string | null> {
    if (this.catalog[list].has(row.id)) return null;
    // The row was validated as this DTO class in validate().
    await create(plainToInstance(row.spec.dto, row.data) as never);
    return row.id;
  }

  private async loadDone() {
    const records = await this.ds.getRepository(ImportRecord).find();
    this.done = new Map();
    for (const r of records) this.remember(r.kind, r.externalId, r.internalId);
  }

  private remember(kind: string, ext: string, internal: string) {
    let m = this.done.get(kind);
    if (!m) this.done.set(kind, (m = new Map()));
    m.set(ext, internal);
  }

  /** Roles of people imported in earlier runs, by WeGro id. */
  private async importedRoles(): Promise<Map<string, string>> {
    const ids = this.done.get('person');
    if (!ids?.size) return new Map();
    const users = await this.ds.getRepository(User).find({
      where: { id: In([...ids.values()]) },
      select: { id: true, role: true },
    });
    const byId = new Map(users.map((u) => [u.id, u.role as string]));
    return new Map([...ids].map(([ext, id]) => [ext, byId.get(id) ?? '']));
  }

  private produceCategories(): Map<string, string> {
    return new Map([
      ...this.catalog
        .bundle(true)
        .produceTypes.map((p) => [p.code, p.category] as const),
      ...this.rows
        .filter((r) => r.spec.kind === 'produce-type')
        .map((r) => [r.id, String(r.data.category)] as const),
    ]);
  }

  private async superAdmin(required: boolean): Promise<AuthUser | null> {
    const u = await this.ds
      .getRepository(User)
      .findOneBy({ role: Role.SuperAdmin });
    if (!u && required) throw new Error('No super admin');
    return u ? toActor(u) : null;
  }

  private async adminActor(): Promise<AuthUser> {
    return this.staffActor(Role.Admin, this.opts.adminPhone);
  }

  private async staffActor(role: Role, phone?: string): Promise<AuthUser> {
    const u = await this.findStaff(role, phone, true);
    return toActor(u!);
  }

  /** The verified person in `role` with this phone, or the first such one. */
  private async findStaff(
    role: Role,
    phone: string | undefined,
    required: boolean,
  ): Promise<User | null> {
    const repo = this.ds.getRepository(User);
    const normalised = phone ? normalisePhone(phone) : null;
    const u = await repo.findOne({
      where: {
        role,
        status: ParticipantStatus.Verified,
        ...(normalised && { phoneIndex: this.codec.phoneIndex(normalised) }),
      },
      order: { createdAt: 'ASC' },
    });
    if (!u && required)
      throw new Error(
        `No verified ${role}${phone ? ` with phone ${phone}` : ''}`,
      );
    return u;
  }

  private async actor(userId: string): Promise<AuthUser> {
    return toActor(
      await this.ds.getRepository(User).findOneByOrFail({ id: userId }),
    );
  }
}

function toActor(u: User): AuthUser {
  return {
    id: u.id,
    role: u.role,
    status: u.status,
    chainState: u.chainState,
    keyIndex: u.keyIndex,
    mustChangePassword: false,
  };
}

function termsOf(p: ProjectRow, category: string) {
  return {
    title: p.title,
    description: p.description ?? null,
    produceCode: p.produceCode,
    category,
    districtCode: p.districtCode,
    location: p.location,
    farmerId: PLACEHOLDER_UUID,
    durationType: p.durationType,
    durationMonths: p.durationMonths,
    payoutIntervalMonths: p.payoutIntervalMonths ?? 0,
    fundingTarget: takaToPoisha(String(p.fundingTarget)),
    slotPrice: takaToPoisha(String(p.slotPrice)),
    farmerBps: p.farmerBps ?? DEFAULT_SPLIT.farmerBps,
    investorBps: p.investorBps ?? DEFAULT_SPLIT.investorBps,
    wegroBps: p.wegroBps ?? DEFAULT_SPLIT.wegroBps,
    insured: p.insured ?? false,
    estimatedReturnMinBps: p.estimatedReturnMinBps,
    estimatedReturnMaxBps: p.estimatedReturnMaxBps,
    plannedStartDate: p.plannedStartDate ?? null,
  };
}

/** class-validator errors, nested ones included, as plain messages. */
function flatten(e: import('class-validator').ValidationError): string[] {
  return [
    ...Object.values(e.constraints ?? {}),
    ...(e.children ?? []).flatMap((c) =>
      flatten(c).map((m) => `${e.property}: ${m}`),
    ),
  ];
}

function describe(error: unknown): string {
  if (error instanceof HttpException) {
    const body = error.getResponse() as { message?: unknown; code?: string };
    const message = Array.isArray(body.message)
      ? body.message.join('; ')
      : typeof body.message === 'string'
        ? body.message
        : error.message;
    return body.code ? `${body.code}: ${message}` : message;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Files the import writes next to the CSVs (reports, credentials). */
export function isOutput(file: string): boolean {
  return file.startsWith('import-report-') || file.startsWith('credentials-');
}
