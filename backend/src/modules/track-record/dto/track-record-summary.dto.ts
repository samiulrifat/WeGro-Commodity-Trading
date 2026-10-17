import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlaceDto } from '../../../common/swagger/refs';

/**
 * The published track record (TrackRecordSummary in track-record-summary.ts),
 * described field by field. Money is taka; quantities in the produce's unit.
 */

export class SummaryProduceDto {
  @ApiProperty({ example: 'MAIZE' })
  code: string;

  @ApiProperty({ example: 'Maize' })
  name: string;

  @ApiProperty({ example: 'kg' })
  unit: string;
}

export class SummaryFarmerDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: PlaceDto, nullable: true })
  district: PlaceDto | null;
}

export class OutcomeMoneyDto {
  @ApiProperty({ example: '50000.00' }) fundingRaised: string;
  @ApiProperty() income: string;
  @ApiProperty() sales: string;
  @ApiProperty() insurance: string;
  @ApiProperty() costs: string;
  @ApiProperty() inputs: string;
  @ApiProperty() otherCosts: string;
  @ApiProperty({ description: 'Income less costs; negative is a loss' })
  net: string;
  @ApiProperty() farmerReceived: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Investors back over what they put in, percent',
  })
  investorReturnPercent: string | null;
}

export class OutcomeHarvestDto {
  @ApiProperty({ type: String, nullable: true }) harvested: string | null;
  @ApiProperty() sold: string;
  @ApiProperty({ example: 'kg' }) unit: string;
}

export class OutcomeEventDto {
  @ApiProperty({ example: 'FLOOD' }) type: string;
  @ApiProperty({ format: 'date' }) occurredOn: string;
  @ApiProperty({ example: 'severe' }) severity: string;
}

export class OutcomeRiskDto {
  @ApiProperty() claimsApproved: number;
  @ApiProperty() claimsRejected: number;
  @ApiProperty() approvedAmount: string;
  @ApiProperty({ type: [OutcomeEventDto] }) events: OutcomeEventDto[];
}

export class ProjectOutcomeDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() title: string;
  @ApiProperty({ type: SummaryProduceDto }) produce: SummaryProduceDto;
  @ApiProperty({ type: PlaceDto }) district: PlaceDto;
  @ApiProperty({ example: 'short_term' }) durationType: string;
  @ApiProperty() durationMonths: number;
  @ApiProperty({ type: String, format: 'date', nullable: true })
  startedOn: string | null;
  @ApiProperty({ type: String, format: 'date', nullable: true })
  plannedEndOn: string | null;
  @ApiProperty({ type: String, format: 'date', nullable: true })
  finishedOn: string | null;
  @ApiProperty({ type: Boolean, nullable: true }) onTime: boolean | null;
  @ApiProperty({ type: OutcomeMoneyDto }) money: OutcomeMoneyDto;
  @ApiProperty({ type: OutcomeHarvestDto }) harvest: OutcomeHarvestDto;
  @ApiProperty({ type: OutcomeRiskDto }) risk: OutcomeRiskDto;
}

export class SummaryTotalsDto {
  @ApiProperty() projects: number;
  @ApiProperty() finishedOnTime: number;
  @ApiProperty() fundingRaised: string;
  @ApiProperty() income: string;
  @ApiProperty() costs: string;
  @ApiProperty() net: string;
  @ApiProperty() farmerReceived: string;
  @ApiProperty() claimsApproved: number;
  @ApiProperty() claimsApprovedAmount: string;
}

export class SummaryImportedProjectDto {
  @ApiProperty() title: string;
  @ApiProperty({ type: SummaryProduceDto }) produce: SummaryProduceDto;
  @ApiProperty({ type: PlaceDto }) district: PlaceDto;
  @ApiProperty({ format: 'date' }) startedOn: string;
  @ApiProperty({ format: 'date' }) finishedOn: string;
  @ApiProperty() fundingRaised: string;
  @ApiProperty() income: string;
  @ApiProperty() costs: string;
  @ApiProperty() net: string;
  @ApiProperty() farmerReceived: string;
  @ApiProperty({ type: String, nullable: true }) harvested: string | null;
  @ApiProperty({ type: String, nullable: true }) sold: string | null;
}

export class TrackRecordSummaryDto {
  @ApiProperty({ enum: [1, 2], description: '2 added importedHistory' })
  v: 1 | 2;
  @ApiProperty({ format: 'uuid' }) recordId: string;
  @ApiProperty({ format: 'date-time' }) generatedAt: string;
  @ApiProperty({ type: SummaryFarmerDto }) farmer: SummaryFarmerDto;
  @ApiProperty({ type: [ProjectOutcomeDto] }) projects: ProjectOutcomeDto[];
  @ApiProperty({ type: SummaryTotalsDto }) totals: SummaryTotalsDto;
  @ApiPropertyOptional({
    type: [SummaryImportedProjectDto],
    description: "WeGro's own records of projects before the platform",
  })
  importedHistory?: SummaryImportedProjectDto[];
}
