import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum BankListSource {
  /** The files that come with the backend, loaded into an empty list. */
  BUNDLED = 'bundled',
  /** Files an admin uploaded. */
  UPLOAD = 'upload',
}

/** Each time the bank list was loaded or replaced: by whom, from what. */
@Entity('bank_list_imports')
export class BankListImport {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 10 })
  source: BankListSource;

  /** Null for the bundled list, loaded at startup. */
  @Column({ type: 'uuid', nullable: true })
  importedById: string | null;

  /** SHA-256 of the branches file as received. */
  @Column({ type: 'char', length: 64 })
  branchesSha256: string;

  /** SHA-256 of the districts file, when one came with it. */
  @Column({ type: 'char', length: 64, nullable: true })
  districtsSha256: string | null;

  @Column({ type: 'integer' })
  bankCount: number;

  @Column({ type: 'integer' })
  districtCount: number;

  @Column({ type: 'integer' })
  branchCount: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
