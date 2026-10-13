import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { DISTRICT_CODES } from '../../../common/reference/bd-districts';
import { CODE_PATTERN } from '../../catalog/catalog.enums';
import { ProduceRefDto } from '../../projects/dto/project-response.dto';
import { ListingStatus, OfferStatus } from '../trade.enums';

export { PaymentReferenceDto } from '../../projects/dto/project-request.dto';
export { ProduceRefDto };

const TAKA = /^(0|[1-9]\d{0,13})(\.\d{1,2})?$/;
const Taka = () =>
  Matches(TAKA, {
    message: '$property must be taka as a string, e.g. "31.50"',
  });
const MAX_QTY = 1_000_000_000_000;
const Bool = () =>
  Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : value === true || value === 'true',
  );

// --- Requests ---

export class ListReceiptDto {
  @ApiProperty({
    example: '0x…',
    description: 'A warehouse receipt your side owns',
  })
  @Matches(/^0x[0-9a-fA-F]{64}$/)
  receiptId: string;

  @ApiProperty({
    example: '31.50',
    description: 'Taka per unit of the produce',
  })
  @Taka()
  askingUnitPrice: string;
}

export class ListProduceDto {
  @ApiProperty({
    format: 'uuid',
    description: 'An active project with fresh produce',
  })
  @IsUUID('4')
  projectId: string;

  @ApiProperty({ example: 1000 })
  @IsInt()
  @Min(1)
  @Max(MAX_QTY)
  quantity: number;

  @ApiProperty({ example: '42.00' })
  @Taka()
  askingUnitPrice: string;
}

export class ListListingsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ListingStatus, default: ListingStatus.Open })
  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;

  @ApiPropertyOptional({ example: 'MAIZE' })
  @IsOptional()
  @Matches(CODE_PATTERN)
  produceCode?: string;

  @ApiPropertyOptional({ enum: DISTRICT_CODES })
  @IsOptional()
  @IsIn(DISTRICT_CODES)
  districtCode?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}

export class MakeOfferDto {
  @ApiProperty({
    example: 2000,
    description: 'All or part of what is available',
  })
  @IsInt()
  @Min(1)
  @Max(MAX_QTY)
  quantity: number;

  @ApiProperty({ example: '31.00', description: 'Your own price per unit' })
  @Taka()
  unitPrice: string;
}

export class ListOffersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : Number(value),
  )
  listingId?: number;

  @ApiPropertyOptional({ enum: OfferStatus })
  @IsOptional()
  @IsEnum(OfferStatus)
  status?: OfferStatus;

  @ApiPropertyOptional({
    description: 'Only deals whose delivery quantities disagree',
  })
  @IsOptional()
  @Bool()
  @IsBoolean()
  discrepancy?: boolean;
}

export class ConfirmDeliveryDto {
  @ApiProperty({
    example: 2000,
    description: 'Quantity received (buyer) or handed over (handler)',
  })
  @IsInt()
  @Min(1)
  @Max(MAX_QTY)
  quantity: number;

  @ApiPropertyOptional({ maxLength: 1000, description: 'Condition on arrival' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.normalize('NFC').trim() || null : value,
  )
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'From POST /photos' })
  @IsOptional()
  @IsUUID('4')
  photoId?: string | null;
}

export class PostRequestDto {
  @ApiProperty({ example: 'MAIZE' })
  @Matches(CODE_PATTERN)
  produceCode: string;

  @ApiProperty({ example: 20000 })
  @IsInt()
  @Min(1)
  @Max(MAX_QTY)
  quantity: number;

  @ApiProperty({
    example: '32.00',
    description: 'Highest price per unit you would pay',
  })
  @Taka()
  maxUnitPrice: string;

  @ApiProperty({ example: '2026-12-31', description: 'Open through this day' })
  @IsDateString({ strict: true })
  validUntil: string;
}

export class ListRequestsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'MAIZE' })
  @IsOptional()
  @Matches(CODE_PATTERN)
  produceCode?: string;

  @ApiPropertyOptional({
    description: 'Include cancelled and expired requests',
  })
  @IsOptional()
  @Bool()
  @IsBoolean()
  includeClosed?: boolean;

  @ApiPropertyOptional({ description: 'Only your own (buyers)' })
  @IsOptional()
  @Bool()
  @IsBoolean()
  mine?: boolean;
}

// --- Responses ---

class TradePartyDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class SellerDto {
  @ApiProperty({ enum: ['wegro', 'farmer'] })
  kind: 'wegro' | 'farmer';

  @ApiPropertyOptional({ nullable: true, type: String })
  id: string | null;

  @ApiProperty()
  name: string;
}

export class ListingDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ type: TradePartyDto })
  project: TradePartyDto;

  @ApiProperty({ example: { code: 'BOGURA', name: 'Bogura' } })
  district: { code: string; name: string };

  @ApiProperty({ type: ProduceRefDto })
  produce: ProduceRefDto;

  @ApiProperty({ enum: ['warehouse', 'fresh'] })
  source: 'warehouse' | 'fresh';

  @ApiPropertyOptional({ nullable: true, type: String })
  receiptId: string | null;

  @ApiProperty({ type: SellerDto })
  seller: SellerDto;

  @ApiProperty()
  quantity: number;

  @ApiProperty({ description: 'Not yet reserved by a deal' })
  available: number;

  @ApiProperty({ example: '31.50' })
  askingUnitPrice: string;

  @ApiProperty()
  unpaidDeals: number;

  @ApiProperty({ enum: ListingStatus })
  status: ListingStatus;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({ nullable: true, type: Date })
  closedAt: Date | null;
}

export class DeliveryViewDto {
  @ApiProperty()
  quantity: number;

  @ApiPropertyOptional({ nullable: true, type: String })
  notes: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  photoUrl: string | null;

  @ApiProperty({ enum: ['submitted', 'recorded'] })
  status: 'submitted' | 'recorded';

  @ApiPropertyOptional({ nullable: true, type: Date })
  recordedAt: Date | null;
}

export class OfferDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  listingId: number;

  @ApiProperty({ type: ProduceRefDto })
  produce: ProduceRefDto;

  @ApiProperty({ type: TradePartyDto })
  buyer: TradePartyDto;

  @ApiProperty()
  quantity: number;

  @ApiProperty({ example: '31.00' })
  unitPrice: string;

  @ApiProperty({ example: '62000.00' })
  amount: string;

  @ApiProperty({ enum: OfferStatus })
  status: OfferStatus;

  @ApiProperty()
  madeAt: Date;

  @ApiPropertyOptional({
    nullable: true,
    type: Date,
    description: 'Deals: pay before this',
  })
  paymentDueAt: Date | null;

  @ApiProperty({
    description: 'An approved deal past its payment deadline (ledger clock)',
  })
  overdue: boolean;

  @ApiPropertyOptional({ nullable: true, type: Date })
  paidAt: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: "The buyer's warehouse receipt",
  })
  receiptPartId: string | null;

  @ApiPropertyOptional({ nullable: true, type: DeliveryViewDto })
  buyerDelivery: DeliveryViewDto | null;

  @ApiPropertyOptional({ nullable: true, type: DeliveryViewDto })
  handlerDelivery: DeliveryViewDto | null;

  @ApiProperty({
    description: 'A confirmed delivery quantity differs from the deal',
  })
  discrepancy: boolean;

  @ApiPropertyOptional({ nullable: true, type: Date })
  deliveredAt: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Accounts, admins and auditors',
  })
  paymentReference?: string | null;
}

export class MatchingListingDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  available: number;

  @ApiProperty({ example: '30.00' })
  askingUnitPrice: string;

  @ApiProperty({ example: 'Bogura' })
  district: string;
}

export class BuyerRequestDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ type: TradePartyDto })
  buyer: TradePartyDto;

  @ApiProperty({ type: ProduceRefDto })
  produce: ProduceRefDto;

  @ApiProperty()
  quantity: number;

  @ApiProperty({ example: '32.00' })
  maxUnitPrice: string;

  @ApiProperty({ example: '2026-12-31', description: 'Open through this day' })
  validUntil: string;

  @ApiProperty({ enum: ['open', 'cancelled', 'expired'] })
  status: 'open' | 'cancelled' | 'expired';

  @ApiProperty()
  postedAt: Date;

  @ApiProperty({
    type: [MatchingListingDto],
    description: 'Open listings of this produce at or below the price',
  })
  matchingListings: MatchingListingDto[];
}
