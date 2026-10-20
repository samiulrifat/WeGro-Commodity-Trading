import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, Repository } from 'typeorm';
import { ErrorCode } from '../../common/errors/error-code';
import { problem } from '../../common/errors/problem';
import type { AuthUser } from '../auth/auth-user';
import { PersonalDetails } from '../users/entities/personal-details.entity';
import { PersonalDetailsCodec } from '../users/personal-details.codec';
import {
  BRANCHES_FILE,
  type BankListData,
  DISTRICTS_FILE,
  parseBankList,
} from './bank-list-file';
import type {
  BankListStatusDto,
  BranchDto,
  ListedBankDto,
  ListedBranchDto,
  ListedDistrictDto,
} from './dto/bank-list.dto';
import {
  BankListImport,
  BankListSource,
} from './entities/bank-list-import.entity';
import { ListedBank } from './entities/listed-bank.entity';
import { ListedBranch } from './entities/listed-branch.entity';
import { ListedDistrict } from './entities/listed-district.entity';

/** The official list that comes with the backend (src/database/bank seeds). */
export const BUNDLED_DIR = join(
  __dirname,
  '..',
  '..',
  'database',
  'bank seeds',
);

/** Rows per insert: well under Postgres's limit on parameters. */
const INSERT_BATCH = 2000;

/** Imports one at a time, the startup load among them. */
const LOCK_KEY = 'bank_list';

/** The files of one import, as received. */
export interface BankListFiles {
  branches: Buffer;
  districts?: Buffer;
}

/**
 * Bangladesh's banks, their branches by district and each branch's routing
 * number, from the official list. Payees pick bank, district and branch;
 * the routing number comes from here. An admin replaces the whole list by
 * importing new files; an empty list is filled from the bundled files at
 * startup. Every import is recorded.
 */
@Injectable()
export class BankListService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BankListService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ListedBank)
    private readonly banksRepo: Repository<ListedBank>,
    @InjectRepository(ListedBranch)
    private readonly branchesRepo: Repository<ListedBranch>,
    @InjectRepository(BankListImport)
    private readonly imports: Repository<BankListImport>,
    @InjectRepository(PersonalDetails)
    private readonly details: Repository<PersonalDetails>,
    private readonly codec: PersonalDetailsCodec,
  ) {}

  /** Every bank, by name. */
  banks(): Promise<ListedBankDto[]> {
    return this.banksRepo.find({ order: { name: 'ASC' } });
  }

  /** The districts where a bank has branches, by name. */
  async districts(bankCode: number): Promise<ListedDistrictDto[]> {
    const rows: Array<{ code: number; name: string }> =
      await this.dataSource.query(
        `SELECT d.code, d.name FROM bank_list_districts d
          WHERE EXISTS (SELECT 1 FROM bank_list_branches b
                         WHERE b.bank_code = $1 AND b.district_code = d.code)
          ORDER BY d.name`,
        [bankCode],
      );
    return rows;
  }

  /** A bank's branches in one district, by name. */
  async branches(
    bankCode: number,
    districtCode: number,
  ): Promise<ListedBranchDto[]> {
    const rows = await this.branchesRepo.find({
      where: { bankCode, districtCode },
      select: { routingNumber: true, name: true },
      order: { name: 'ASC', routingNumber: 'ASC' },
    });
    return rows.map((r) => ({ routingNumber: r.routingNumber, name: r.name }));
  }

  /** The branch a routing number belongs to, with its bank and district. */
  async branch(routingNumber: string): Promise<BranchDto> {
    const found = await this.find(routingNumber);
    if (!found) {
      throw new NotFoundException({
        message: `No branch has routing number ${routingNumber}`,
        code: ErrorCode.BANK_BRANCH_NOT_FOUND,
        details: { routingNumber },
      });
    }
    return found;
  }

  /** As branch(), or null when the list has no such routing number. */
  async find(routingNumber: string): Promise<BranchDto | null> {
    if (!/^\d{9}$/.test(routingNumber)) return null;
    const rows: Array<{
      routing_number: string;
      name: string;
      branch_code: number;
      bank_code: number;
      bank_name: string;
      district_code: number;
      district_name: string;
    }> = await this.dataSource.query(
      `SELECT b.routing_number, b.name, b.branch_code,
              k.code AS bank_code, k.name AS bank_name,
              d.code AS district_code, d.name AS district_name
         FROM bank_list_branches b
         JOIN bank_list_banks k ON k.code = b.bank_code
         JOIN bank_list_districts d ON d.code = b.district_code
        WHERE b.routing_number = $1`,
      [routingNumber],
    );
    const r = rows[0];
    return r
      ? {
          routingNumber: r.routing_number,
          name: r.name,
          branchCode: r.branch_code,
          bank: { code: r.bank_code, name: r.bank_name },
          district: { code: r.district_code, name: r.district_name },
        }
      : null;
  }

  /** How big the list is and where it came from. */
  async status(): Promise<BankListStatusDto> {
    const last = await this.imports.findOne({
      where: {},
      order: { id: 'DESC' },
    });
    if (!last) {
      return {
        bankCount: 0,
        districtCount: 0,
        branchCount: 0,
        importedAt: null,
        importedBy: null,
        source: null,
      };
    }
    const importer = last.importedById
      ? await this.details.findOne({
          where: { userId: last.importedById },
          select: { userId: true, fullNameEnc: true },
        })
      : null;
    return {
      bankCount: last.bankCount,
      districtCount: last.districtCount,
      branchCount: last.branchCount,
      importedAt: last.createdAt,
      importedBy: last.importedById
        ? {
            id: last.importedById,
            name: importer ? this.codec.openName(importer) : '',
          }
        : null,
      source: last.source,
    };
  }

  /** Replaces the whole list with the files an admin sent. */
  async replace(
    actor: AuthUser,
    files: BankListFiles,
  ): Promise<BankListStatusDto> {
    const list = this.parse(files);
    await this.dataSource.transaction(async (m) => {
      await lock(m);
      await this.write(m, list, {
        source: BankListSource.UPLOAD,
        importedById: actor.id,
        ...hashes(files),
      });
    });
    this.logger.log(
      `Bank list replaced by ${actor.id}: ${list.banks.length} banks, ${list.branches.length} branches`,
    );
    return this.status();
  }

  /** Awaited, so payees can pick a branch as soon as the app is up. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.loadBundled();
    } catch (error) {
      this.logger.error(`Bank list not loaded: ${String(error)}`);
    }
  }

  /** Fills an empty list from the bundled files; a list already there stays. */
  async loadBundled(): Promise<boolean> {
    if ((await this.banksRepo.count()) > 0) return false;
    const files: BankListFiles = {
      branches: await readFile(join(BUNDLED_DIR, BRANCHES_FILE)),
      districts: await readFile(join(BUNDLED_DIR, DISTRICTS_FILE)),
    };
    const list = this.parse(files);
    const loaded = await this.dataSource.transaction(async (m) => {
      await lock(m);
      if ((await m.count(ListedBank)) > 0) return false;
      await this.write(m, list, {
        source: BankListSource.BUNDLED,
        importedById: null,
        ...hashes(files),
      });
      return true;
    });
    if (loaded) {
      this.logger.log(
        `Bank list loaded: ${list.banks.length} banks, ${list.branches.length} branches`,
      );
    }
    return loaded;
  }

  // --- Internals ---

  private parse(files: BankListFiles): BankListData {
    const branches = readJson(files.branches, BRANCHES_FILE);
    const districts =
      files.districts === undefined
        ? undefined
        : readJson(files.districts, DISTRICTS_FILE);
    const parsed = parseBankList(branches, districts);
    if (!parsed.ok) {
      throw new UnprocessableEntityException({
        message: 'The bank list has problems; nothing was changed',
        code: ErrorCode.BANK_LIST_INVALID,
        details: { problems: parsed.problems },
      });
    }
    return parsed.list;
  }

  private async write(
    m: EntityManager,
    list: BankListData,
    record: Pick<
      BankListImport,
      'source' | 'importedById' | 'branchesSha256' | 'districtsSha256'
    >,
  ): Promise<void> {
    await m.createQueryBuilder().delete().from(ListedBranch).execute();
    await m.createQueryBuilder().delete().from(ListedBank).execute();
    await m.createQueryBuilder().delete().from(ListedDistrict).execute();
    await insertAll(m, ListedBank, list.banks);
    await insertAll(m, ListedDistrict, list.districts);
    await insertAll(m, ListedBranch, list.branches);
    await m.insert(BankListImport, {
      ...record,
      bankCount: list.banks.length,
      districtCount: list.districts.length,
      branchCount: list.branches.length,
    });
  }
}

async function lock(m: EntityManager): Promise<void> {
  await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [LOCK_KEY]);
}

async function insertAll<T extends object>(
  m: EntityManager,
  entity: new () => T,
  rows: T[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    await m
      .createQueryBuilder()
      .insert()
      .into(entity)
      .values(rows.slice(i, i + INSERT_BATCH))
      .execute();
  }
}

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function hashes(files: BankListFiles) {
  return {
    branchesSha256: sha256(files.branches),
    districtsSha256: files.districts ? sha256(files.districts) : null,
  };
}

/** JSON or nothing: a file that is not JSON is reported like any other problem. */
function readJson(data: Buffer, file: string): unknown {
  try {
    return JSON.parse(data.toString('utf8').replace(/^﻿/, '')) as unknown;
  } catch {
    throw new UnprocessableEntityException({
      message: 'The bank list has problems; nothing was changed',
      code: ErrorCode.BANK_LIST_INVALID,
      details: {
        problems: [
          problem(ErrorCode.BANK_LIST_UNREADABLE, `${file} is not JSON`, {
            file,
            key: file === BRANCHES_FILE ? 'banks' : 'districts',
          }),
        ],
      },
    });
  }
}
