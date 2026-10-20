import { CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/** A project an investor saved to look at again. */
@Entity('project_favourites')
@Index('ix_project_favourites_project', ['projectId'])
export class ProjectFavourite {
  @PrimaryColumn({ type: 'uuid' })
  investorId: string;

  @PrimaryColumn({ type: 'uuid' })
  projectId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
