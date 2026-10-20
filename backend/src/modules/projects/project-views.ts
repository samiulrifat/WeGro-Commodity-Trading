import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { poishaToTaka } from '../../blockchain/utils/money';
import {
  BD_DISTRICTS,
  isDistrictCode,
} from '../../common/reference/bd-districts';
import { bdDayStart, bdDate } from '../../common/time/bd-dates';
import { CatalogService } from '../catalog/catalog.service';
import { PersonalDetails } from '../users/entities/personal-details.entity';
import { PersonalDetailsCodec } from '../users/personal-details.codec';
import type {
  EstimatedReturnDto,
  ProjectDto,
} from './dto/project-response.dto';
import type { Project } from './entities/project.entity';
import { applyBps, bpsToPercent } from './project-terms';

export const ESTIMATE_NOTE =
  'Estimate only. Returns are not guaranteed and depend on the harvest and sale.';

/**
 * Builds API views of projects. Names of produce and districts come from
 * memory; farmers' names are decrypted for a whole page with one query.
 */
@Injectable()
export class ProjectViews {
  constructor(
    private readonly dataSource: DataSource,
    private readonly catalog: CatalogService,
    private readonly codec: PersonalDetailsCodec,
    @InjectRepository(PersonalDetails)
    private readonly details: Repository<PersonalDetails>,
  ) {}

  async names(userIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map();
    const rows = await this.details.find({
      where: { userId: In(unique) },
      select: { userId: true, fullNameEnc: true },
    });
    return new Map(rows.map((r) => [r.userId, this.codec.openName(r)]));
  }

  /**
   * Views of a page of projects: farmers' names, how many investors hold
   * slots and how many reserved today, and for an investor (`viewerId`)
   * which they saved, in one query each.
   */
  async many(projects: Project[], viewerId?: string): Promise<ProjectDto[]> {
    const ids = projects.map((p) => p.id);
    const [names, counts, favourites] = await Promise.all([
      this.names(projects.map((p) => p.farmerId)),
      this.counts(ids),
      viewerId ? this.favourites(viewerId, ids) : Promise.resolve(null),
    ]);
    return projects.map((p) => ({
      ...this.view(p, names.get(p.farmerId) ?? ''),
      investorCount: counts.get(p.id)?.investors ?? 0,
      investingToday: counts.get(p.id)?.today ?? 0,
      ...(favourites && { favourite: favourites.has(p.id) }),
    }));
  }

  async one(project: Project, viewerId?: string): Promise<ProjectDto> {
    return (await this.many([project], viewerId))[0];
  }

  /** Investors holding slots, and those who reserved today (Bangladesh time). */
  private async counts(
    ids: string[],
  ): Promise<Map<string, { investors: number; today: number }>> {
    if (ids.length === 0) return new Map();
    const today = new Date(bdDayStart(bdDate(new Date())));
    const rows: Array<{
      project_id: string;
      investors: string;
      today: string;
    }> = await this.dataSource.query(
      `SELECT project_id,
                COUNT(DISTINCT investor_id) FILTER (WHERE status = 'confirmed') AS investors,
                COUNT(DISTINCT investor_id) FILTER (
                  WHERE status IN ('pending', 'confirmed') AND reserved_at >= $2
                ) AS today
           FROM reservations
          WHERE project_id = ANY($1::uuid[])
          GROUP BY project_id`,
      [ids, today],
    );
    return new Map(
      rows.map((r) => [
        r.project_id,
        { investors: Number(r.investors), today: Number(r.today) },
      ]),
    );
  }

  private async favourites(
    investorId: string,
    ids: string[],
  ): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows: Array<{ project_id: string }> = await this.dataSource.query(
      `SELECT project_id FROM project_favourites
        WHERE investor_id = $1 AND project_id = ANY($2::uuid[])`,
      [investorId, ids],
    );
    return new Set(rows.map((r) => r.project_id));
  }

  view(
    p: Project,
    farmerName: string,
  ): Omit<ProjectDto, 'investorCount' | 'investingToday' | 'favourite'> {
    const produce = this.catalog.produceTypes.get(p.produceCode);
    const unit = produce ? this.catalog.units.get(produce.unitCode) : undefined;
    const district = isDistrictCode(p.districtCode)
      ? BD_DISTRICTS[p.districtCode]
      : null;
    return {
      id: p.id,
      title: p.title,
      description: p.description,
      produce: {
        code: p.produceCode,
        name: produce?.name ?? p.produceCode,
        nameBn: produce?.nameBn,
        unit: unit?.symbol ?? '',
      },
      category: p.category,
      district: {
        code: p.districtCode,
        name: district?.name ?? p.districtCode,
      },
      location: p.location,
      farmer: { id: p.farmerId, fullName: farmerName },
      durationType: p.durationType,
      durationMonths: p.durationMonths,
      payoutIntervalMonths: p.payoutIntervalMonths,
      fundingTarget: poishaToTaka(p.fundingTarget),
      slotPrice: poishaToTaka(p.slotPrice),
      totalSlots: p.totalSlots,
      issuedSlots: p.issuedSlots,
      reservedSlots: p.reservedSlots,
      availableSlots: p.totalSlots - p.issuedSlots - p.reservedSlots,
      fundedPercent: bpsToPercent(
        p.totalSlots === 0
          ? 0
          : Math.floor((p.issuedSlots * 10_000) / p.totalSlots),
      ),
      split: {
        farmer: bpsToPercent(p.farmerBps),
        investors: bpsToPercent(p.investorBps),
        wegro: bpsToPercent(p.wegroBps),
      },
      insured: p.insured,
      estimatedReturn: estimate(p, p.slotPrice),
      plannedStartDate: p.plannedStartDate,
      coverPhotoUrl: p.coverPhotoId ? `/api/projects/${p.id}/cover` : null,
      stage: p.stage,
      chainState: p.chainState,
      termsHash: p.termsHash,
      refundTotal: p.refundTotal === null ? null : poishaToTaka(p.refundTotal),
      publishedAt: p.publishedAt,
      stageChangedAt: p.stageChangedAt,
      createdAt: p.createdAt,
    };
  }
}

/** The estimated return on `amount`, rounded down to whole poisha. */
export function estimate(
  p: Pick<Project, 'estimatedReturnMinBps' | 'estimatedReturnMaxBps'>,
  amount: bigint,
): EstimatedReturnDto {
  return {
    minPercent: bpsToPercent(p.estimatedReturnMinBps),
    maxPercent: bpsToPercent(p.estimatedReturnMaxBps),
    minAmount: poishaToTaka(applyBps(amount, p.estimatedReturnMinBps)),
    maxAmount: poishaToTaka(applyBps(amount, p.estimatedReturnMaxBps)),
    note: ESTIMATE_NOTE,
  };
}
