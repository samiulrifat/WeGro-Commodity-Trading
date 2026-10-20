import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { uuidToBytes32 } from '../../blockchain/utils/ids';
import {
  actor,
  ChainState,
  fakeCatalog,
  fakeQueryBuilder,
  fakeRepo,
  fakeTx,
  ParticipantStatus,
  revert,
  Role,
} from '../../../test/support/unit';
import type { Project } from './entities/project.entity';
import { ProjectChainState, ProjectStage } from './project.enums';
import { termsHash } from './project-terms';
import { ProjectsService, termsOf } from './projects.service';

const ID = '3f0c2a7e-8d4b-4e1a-9c6f-1b2d3e4f5a6b';
const FARMER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const dto = {
  title: 'Maize in Bogura',
  produceCode: 'MAIZE',
  districtCode: 'BOGURA',
  location: 'Shibganj',
  farmerId: FARMER,
  durationType: 'short_term',
  durationMonths: 5,
  fundingTarget: '50000',
  slotPrice: '10000',
  estimatedReturnMinBps: 500,
  estimatedReturnMaxBps: 1500,
};

describe('ProjectsService', () => {
  const admin = actor(Role.ADMIN);

  /**
   * One project in memory; `ledger` is its stage number on the ledger
   * (0 = unknown) and moves as calls are sent.
   */
  const build = (
    opts: {
      project?: Partial<Project> | null;
      farmer?: object | null;
      ledger?: number;
    } = {},
  ) => {
    let row: Project | null =
      opts.project === null
        ? null
        : ({
            id: ID,
            ...dto,
            description: null,
            category: 'grain',
            payoutIntervalMonths: 0,
            fundingTarget: 5_000_000n,
            slotPrice: 1_000_000n,
            farmerBps: 4000,
            investorBps: 4000,
            wegroBps: 2000,
            insured: false,
            plannedStartDate: null,
            stage: ProjectStage.DRAFT,
            chainState: ProjectChainState.LOCAL,
            termsHash: null,
            issuedSlots: 0,
            ...opts.project,
          } as Project);
    const projects = fakeRepo({
      save: jest.fn(
        (p: Project) => ((row = { ...p, id: ID }), Promise.resolve(row)),
      ),
      findOneBy: jest.fn(() => Promise.resolve(row)),
      findOneByOrFail: jest.fn(() => Promise.resolve(row)),
      update: jest.fn((where: Partial<Project>, patch: Partial<Project>) => {
        if (!row || (where.chainState && row.chainState !== where.chainState))
          return Promise.resolve({ affected: 0 });
        Object.assign(row, patch);
        return Promise.resolve({ affected: 1 });
      }),
      delete: jest.fn(() => Promise.resolve({ affected: 1 })),
    });
    const farmer =
      opts.farmer === undefined
        ? {
            id: FARMER,
            role: Role.FARMER,
            status: ParticipantStatus.VERIFIED,
            chainState: ChainState.CONFIRMED,
          }
        : opts.farmer;
    const users = fakeRepo({ findOne: jest.fn(() => Promise.resolve(farmer)) });
    let stage = opts.ledger ?? 0;
    const chain = fakeTx((call) => {
      if (call.method === 'createProject') stage = 1;
      if (call.method === 'openForFunding') stage = 2;
      return [];
    });
    const getProject = jest.fn(() =>
      Promise.resolve({
        stage: BigInt(stage),
        terms: { termsHash: row?.termsHash ?? null },
        issuedSlots: BigInt(row?.issuedSlots ?? 0),
      }),
    );
    const views = {
      one: jest.fn((p: Project) =>
        Promise.resolve({ id: p.id, stage: p.stage }),
      ),
      many: jest.fn(() => Promise.resolve([])),
    };
    const service = new ProjectsService(
      { query: jest.fn(() => Promise.resolve([])) } as never,
      projects as never,
      users as never,
      fakeCatalog() as never,
      views as never,
      chain.tx as never,
      { get: () => ({ getProject }) } as never,
      { apply: jest.fn(() => Promise.resolve()) } as never,
      {} as never,
    );
    return { service, projects, chain, row: () => row! };
  };

  describe('drafts', () => {
    it('stores a draft locally, in poisha, with the default split and the crop’s category', async () => {
      const { service, row, chain } = build({ project: null });
      await service.create(admin, dto as never);
      expect(row()).toMatchObject({
        fundingTarget: 5_000_000n,
        slotPrice: 1_000_000n,
        totalSlots: 5,
        farmerBps: 4000,
        category: 'grain',
        chainState: ProjectChainState.LOCAL,
        createdById: admin.id,
      });
      expect(chain.sent).toEqual([]);
    });

    it('lists every problem with the terms, including an unverified farmer', async () => {
      const { service } = build({
        project: null,
        farmer: {
          id: FARMER,
          role: Role.FARMER,
          status: ParticipantStatus.PENDING,
        },
      });
      const err = await service
        .create(admin, { ...dto, fundingTarget: '45000' } as never)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      expect((err as UnprocessableEntityException).getResponse()).toMatchObject(
        {
          code: 'INVALID_TERMS',
          details: {
            problems: [
              expect.objectContaining({ code: 'TERMS_PARTIAL_SLOT' }),
              expect.objectContaining({ code: 'TERMS_FARMER_NOT_VERIFIED' }),
            ],
          },
        },
      );
    });

    it('keeps the draft’s other terms when one field changes', async () => {
      const { service, row } = build();
      await service.update(ID, { slotPrice: '5000' } as never);
      expect(row()).toMatchObject({
        slotPrice: 500_000n,
        fundingTarget: 5_000_000n,
        totalSlots: 10,
        title: dto.title,
      });
    });

    it('refuses to change or delete a published project', async () => {
      const { service } = build({
        project: { chainState: ProjectChainState.CONFIRMED },
      });
      await expect(service.update(ID, { title: 'x' } as never)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.remove(ID)).rejects.toThrow(
        'Published projects cannot be changed or deleted',
      );
    });
  });

  describe('publishing', () => {
    it('fixes the terms hash, creates the project on the ledger and opens it', async () => {
      const { service, chain, row } = build();
      await service.publish(admin, ID);
      const hash = termsHash(ID, termsOf(row()));
      expect(row()).toMatchObject({
        chainState: ProjectChainState.SUBMITTED,
        termsHash: hash,
      });
      expect(chain.methods()).toEqual(['createProject', 'openForFunding']);
      const [id, terms] = chain.sent[0].args as [
        string,
        Record<string, unknown>,
      ];
      expect(id).toBe(uuidToBytes32(ID));
      expect(terms).toMatchObject({
        farmerId: uuidToBytes32(FARMER),
        fundingTarget: 5_000_000n,
        termsHash: hash,
      });
      expect(chain.sent.every((c) => c.signer === admin.keyIndex)).toBe(true);
    });

    it('picks up where it stopped: a project already created is only opened', async () => {
      const { service, chain } = build({
        project: { chainState: ProjectChainState.SUBMITTED, termsHash: '0x1' },
        ledger: 1,
      });
      await service.publish(admin, ID);
      expect(chain.methods()).toEqual(['openForFunding']);
    });

    it('sends nothing for a project already open', async () => {
      const { service, chain } = build({
        project: { chainState: ProjectChainState.CONFIRMED, termsHash: '0x1' },
        ledger: 2,
      });
      await service.publish(admin, ID);
      expect(chain.sent).toEqual([]);
    });

    it('goes back to an editable draft when the ledger refuses the project', async () => {
      const { service, chain, row } = build();
      chain.fail(revert('ProjectExists'));
      await expect(service.publish(admin, ID)).rejects.toThrow();
      expect(row()).toMatchObject({
        chainState: ProjectChainState.LOCAL,
        termsHash: null,
      });
    });

    it('stays submitted when the node fails: the call may still land', async () => {
      const { service, chain, row } = build();
      chain.fail(new Error('timeout'));
      await expect(service.publish(admin, ID)).rejects.toThrow('timeout');
      expect(row().chainState).toBe(ProjectChainState.SUBMITTED);
    });

    it('lets only one of two racing publishes through', async () => {
      const { service, projects } = build();
      projects.update.mockResolvedValueOnce({ affected: 0 });
      await expect(service.publish(admin, ID)).rejects.toThrow(
        'Already being published',
      );
    });
  });

  it('refuses stage moves on a draft that was never published', async () => {
    const { service } = build();
    await expect(service.advance(admin, ID, 'activate')).rejects.toThrow(
      'Publish the project first',
    );
    await expect(service.advance(admin, ID, 'cancelProject')).rejects.toThrow(
      'This draft was never published: delete it instead',
    );
  });

  it('sends a stage move as the admin', async () => {
    const { service, chain } = build({
      project: { chainState: ProjectChainState.CONFIRMED },
    });
    await service.advance(admin, ID, 'markReadyForSale');
    expect(chain.sent[0]).toMatchObject({
      method: 'markReadyForSale',
      args: [uuidToBytes32(ID)],
    });
  });

  describe('who sees what', () => {
    const scoped = async (who: ReturnType<typeof actor>) => {
      const { service, projects } = build();
      const fake = fakeQueryBuilder({ getOne: null });
      projects.createQueryBuilder = jest.fn(() => fake.qb) as never;
      await expect(service.visible(who, ID)).rejects.toThrow(NotFoundException);
      return fake.wheres();
    };

    it('shows staff everything, drafts included', async () => {
      expect(await scoped(actor(Role.FIELD_OFFICER))).toEqual(['p.id = :id']);
    });

    it('shows investors published projects only, and farmers only their own', async () => {
      expect(await scoped(actor(Role.INVESTOR))).toEqual([
        'p.id = :id',
        'p.chain_state <> :local',
      ]);
      expect(await scoped(actor(Role.FARMER))).toEqual([
        'p.id = :id',
        'p.chain_state <> :local',
        'p.farmer_id = :me',
      ]);
    });
  });

  describe('integrity', () => {
    it('matches when the ledger holds the same terms, stage and slots', async () => {
      const { service, row } = build({
        project: {
          chainState: ProjectChainState.CONFIRMED,
          stage: ProjectStage.OPEN_FOR_FUNDING,
        },
        ledger: 2,
      });
      row().termsHash = termsHash(ID, termsOf(row()));
      await expect(service.integrity(ID)).resolves.toMatchObject({
        matches: true,
        mismatches: [],
      });
    });

    it('names each disagreement', async () => {
      const { service, row } = build({
        project: {
          chainState: ProjectChainState.CONFIRMED,
          stage: ProjectStage.ACTIVE,
          termsHash: '0xedited',
        },
        ledger: 2,
      });
      row().title = 'Changed after publishing';
      const res = await service.integrity(ID);
      expect(res.mismatches).toEqual(['termsHash', 'storedHash', 'stage']);
    });

    it('says a draft is not published, and a lost project is not on the ledger', async () => {
      await expect(build().service.integrity(ID)).resolves.toMatchObject({
        mismatches: ['notPublished'],
      });
      await expect(
        build({
          project: { chainState: ProjectChainState.CONFIRMED },
        }).service.integrity(ID),
      ).resolves.toMatchObject({
        mismatches: ['notOnLedger'],
        ledgerHash: null,
      });
    });
  });
});
