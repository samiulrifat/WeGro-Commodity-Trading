import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import { IdentityCryptoService } from '../../common/crypto/identity-crypto.service';
import { PersonalDetails } from './entities/personal-details.entity';
import { PersonNameToken } from './entities/person-name-token.entity';
import { PersonalDetailsCodec } from './personal-details.codec';

/** People indexed per batch when filling in those saved before the index. */
const BACKFILL_BATCH = 500;

/**
 * The words of a name, as searched: Unicode-normalised, lower case, split
 * at anything that is not a letter, mark or digit ("Md." gives "md").
 * Bengali names split the same way; their vowel signs are marks.
 */
export function nameWords(name: string): string[] {
  const words = name
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => w.length > 0);
  return [...new Set(words)];
}

/**
 * The whole-word index of people's names. Written in the same transaction
 * as the name; people saved before it existed are indexed at startup.
 */
@Injectable()
export class NameIndexService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NameIndexService.name);

  constructor(
    private readonly crypto: IdentityCryptoService,
    private readonly codec: PersonalDetailsCodec,
    @InjectRepository(PersonNameToken)
    private readonly tokens: Repository<PersonNameToken>,
  ) {}

  /** The keyed hashes of a text's words, as stored and searched. */
  indexesOf(text: string): string[] {
    return nameWords(text).map((w) => this.crypto.blindIndex('name', w));
  }

  /** Replaces a person's words with those of `fullName`. */
  async write(
    m: EntityManager,
    userId: string,
    fullName: string,
  ): Promise<void> {
    await m.delete(PersonNameToken, { userId });
    const rows = this.indexesOf(fullName).map((tokenIndex) => ({
      userId,
      tokenIndex,
    }));
    if (rows.length > 0) await m.insert(PersonNameToken, rows);
  }

  onApplicationBootstrap(): void {
    void this.backfill().catch((error: unknown) =>
      this.logger.error(`Name index not filled in: ${String(error)}`),
    );
  }

  /** Indexes everyone without words yet, a batch at a time. */
  async backfill(): Promise<number> {
    let done = 0;
    for (;;) {
      const rows: Array<Pick<PersonalDetails, 'userId' | 'fullNameEnc'>> =
        await this.tokens.manager.query(
          `SELECT d.user_id AS "userId", d.full_name_enc AS "fullNameEnc"
             FROM personal_details d
            WHERE NOT EXISTS (SELECT 1 FROM person_name_tokens t WHERE t.user_id = d.user_id)
            LIMIT $1`,
          [BACKFILL_BATCH],
        );
      if (rows.length === 0) break;
      await this.tokens.manager.transaction(async (m) => {
        for (const row of rows) {
          await this.write(m, row.userId, this.codec.openName(row));
        }
      });
      done += rows.length;
      if (rows.length < BACKFILL_BATCH) break;
    }
    if (done > 0) this.logger.log(`Indexed the names of ${done} people`);
    return done;
  }
}
