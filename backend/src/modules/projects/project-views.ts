import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { poishaToTaka } from '../../blockchain/utils/money';
import {
  BD_DISTRICTS,
  isDistrictCode,
} from '../../common/reference/bd-districts';
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

  async many(projects: Project[]): Promise<ProjectDto[]> {
    const names = await this.names(projects.map((p) => p.farmerId));
    return projects.map((p) => this.view(p, names.get(p.farmerId) ?? ''));
  }

  async one(project: Project): Promise<ProjectDto> {
    return (await this.many([project]))[0];
  }

  view(p: Project, farmerName: string): ProjectDto {
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
