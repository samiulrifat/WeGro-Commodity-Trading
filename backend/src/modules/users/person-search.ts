import { Injectable } from '@nestjs/common';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import {
  normaliseNid,
  normalisePhone,
} from '../participants/id-check/id-check';
import { NameIndexService } from './name-index.service';
import { PersonalDetailsCodec } from './personal-details.codec';

/** Longest search text taken. */
export const SEARCH_MAX_LENGTH = 100;

/**
 * Finding people by what was typed, without decrypting anyone: a mobile
 * number (phone index), an NID (NID index) or words of a name (every word
 * must be one of the name's words). One rule for every list that shows people.
 */
@Injectable()
export class PersonSearch {
  constructor(
    private readonly codec: PersonalDetailsCodec,
    private readonly names: NameIndexService,
  ) {}

  /**
   * Narrows `qb` to the people `q` finds; `userId` is the column holding
   * the person's id. Nothing to search for leaves it as it is.
   */
  apply<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    userId: string,
    q: string | undefined,
  ): SelectQueryBuilder<T> {
    const text = (q ?? '').trim();
    if (!text) return qb;
    const phone = normalisePhone(text);
    if (phone) {
      return qb.andWhere(
        `${userId} IN (SELECT su.id FROM users su WHERE su.phone_index = :searchPhone)`,
        { searchPhone: this.codec.phoneIndex(phone) },
      );
    }
    const nid = normaliseNid(text);
    if (nid) {
      return qb.andWhere(
        `${userId} IN (SELECT sd.user_id FROM personal_details sd WHERE sd.nid_index = :searchNid)`,
        { searchNid: this.codec.nidIndex(nid) },
      );
    }
    const words = this.names.indexesOf(text);
    if (words.length === 0) return qb.andWhere('1 = 0');
    return qb.andWhere(
      `${userId} IN (SELECT st.user_id FROM person_name_tokens st
         WHERE st.token_index IN (:...searchWords)
         GROUP BY st.user_id HAVING count(*) = :searchWordCount)`,
      { searchWords: words, searchWordCount: words.length },
    );
  }
}
