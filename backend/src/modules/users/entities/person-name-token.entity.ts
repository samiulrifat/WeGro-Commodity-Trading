import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

/**
 * One word of a person's name, as a keyed hash: names stay encrypted, yet
 * typing any whole word of one finds them (an index lookup, nothing
 * decrypted). Rewritten whenever the name changes.
 */
@Entity('person_name_tokens')
@Index('ix_person_name_tokens_token', ['tokenIndex'])
export class PersonNameToken {
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @PrimaryColumn({ type: 'char', length: 64 })
  tokenIndex: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
