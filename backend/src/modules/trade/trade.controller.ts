import { ApiFile, ApiPaged } from '../../common/swagger/envelope';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Paginated } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { PhotosService } from '../field-records/photos.service';
import { Role } from '../users/roles';
import {
  BuyerRequestDto,
  ConfirmDeliveryDto,
  FeeScheduleDto,
  ListExternalDto,
  ListingDto,
  ListListingsQueryDto,
  ListOffersQueryDto,
  ListProduceDto,
  ListReceiptDto,
  ListRequestsQueryDto,
  MakeOfferDto,
  OfferDto,
  PaymentReferenceDto,
  PostRequestDto,
  RejectListingDto,
  SetFeeSlabsDto,
} from './dto/trade.dto';
import { RequestsService } from './requests.service';
import { DeliverySide } from './trade.enums';
import { TradeService } from './trade.service';

const ledgerId = new ParseIntPipe({
  errorHttpStatusCode: HttpStatus.NOT_FOUND,
});
const STAFF = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.OPERATIONS,
  Role.ACCOUNTS,
  Role.AUDITOR,
];
const OFFER_READERS = [
  ...STAFF,
  Role.BUYER,
  Role.FARMER,
  Role.FIELD_OFFICER,
  Role.WAREHOUSE,
  Role.SELLER,
];

/** The marketplace (TradeLedger): listings, offers, deals, payment and delivery. */
@ApiTags('Marketplace')
@ApiBearerAuth()
@Controller()
export class TradeController {
  constructor(
    private readonly trade: TradeService,
    private readonly requests: RequestsService,
    private readonly photos: PhotosService,
  ) {}

  // --- Listings ---

  @Get('listings')
  @ApiPaged()
  @ApiOkResponse({
    type: [ListingDto],
    description: 'Open listings by default',
  })
  listListings(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListListingsQueryDto,
  ): Promise<Paginated<ListingDto>> {
    return this.trade.listListings(actor, query);
  }

  @Get('listings/:id')
  @ApiOkResponse({ type: ListingDto })
  listing(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
  ): Promise<ListingDto> {
    return this.trade.listingOne(id, actor);
  }

  @Get('listings/:id/photos/:index')
  @ApiFile('image/jpeg', 'image/png', 'image/webp')
  async listingPhoto(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
    @Param('index', ledgerId) index: number,
    @Res() res: Response,
  ): Promise<void> {
    const photo = await this.trade.listingPhoto(actor, id, index);
    await this.photos.send(photo, res);
  }

  @Post('listings/external')
  @Roles(Role.SELLER)
  @ApiCreatedResponse({
    type: ListingDto,
    description: 'Your own produce; buyers see it once an admin approves it',
  })
  listExternal(
    @CurrentUser() actor: AuthUser,
    @Body() dto: ListExternalDto,
  ): Promise<ListingDto> {
    return this.trade.listExternal(actor, dto);
  }

  @Post('listings/:id/approve')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ListingDto,
    description: 'An external seller’s listing goes live',
  })
  approveListing(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
  ): Promise<ListingDto> {
    return this.trade.approveListing(actor, id);
  }

  @Post('listings/:id/reject')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ListingDto })
  rejectListing(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
    @Body() dto: RejectListingDto,
  ): Promise<ListingDto> {
    return this.trade.rejectListing(actor, id, dto.reason);
  }

  @Get('marketplace/fees')
  @ApiOkResponse({
    type: FeeScheduleDto,
    description: 'Fixed platform fee per side, by the deal total',
  })
  fees(): Promise<FeeScheduleDto> {
    return this.trade.feeSchedule();
  }

  @Put('marketplace/fees')
  @Roles(Role.SUPER_ADMIN)
  @ApiOkResponse({
    type: FeeScheduleDto,
    description: 'For deals approved from now on',
  })
  setFees(
    @CurrentUser() actor: AuthUser,
    @Body() dto: SetFeeSlabsDto,
  ): Promise<FeeScheduleDto> {
    return this.trade.setFeeSchedule(actor, dto);
  }

  @Post('listings/receipt')
  @Roles(Role.ADMIN, Role.FIELD_OFFICER)
  @ApiCreatedResponse({
    type: ListingDto,
    description: 'List a warehouse receipt your side owns; locks it',
  })
  listReceipt(
    @CurrentUser() actor: AuthUser,
    @Body() dto: ListReceiptDto,
  ): Promise<ListingDto> {
    return this.trade.listReceipt(actor, dto);
  }

  @Post('listings/produce')
  @Roles(Role.ADMIN, Role.FIELD_OFFICER)
  @ApiCreatedResponse({
    type: ListingDto,
    description: 'Fresh produce straight from an active project',
  })
  listProduce(
    @CurrentUser() actor: AuthUser,
    @Body() dto: ListProduceDto,
  ): Promise<ListingDto> {
    return this.trade.listProduce(actor, dto);
  }

  @Post('listings/:id/cancel')
  @Roles(Role.ADMIN, Role.FIELD_OFFICER, Role.SELLER)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ListingDto,
    description: 'An unsold receipt returns to its owner',
  })
  cancelListing(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
  ): Promise<ListingDto> {
    return this.trade.cancelListing(actor, id);
  }

  @Post('listings/:id/offers')
  @Roles(Role.BUYER)
  @ApiCreatedResponse({
    type: OfferDto,
    description: 'Your quantity at your price; an admin decides',
  })
  makeOffer(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
    @Body() dto: MakeOfferDto,
  ): Promise<OfferDto> {
    return this.trade.makeOffer(actor, id, dto);
  }

  // --- Offers and deals ---

  @Get('offers')
  @ApiPaged()
  @Roles(...OFFER_READERS)
  @ApiOkResponse({ type: [OfferDto] })
  listOffers(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListOffersQueryDto,
  ): Promise<Paginated<OfferDto>> {
    return this.trade.listOffers(actor, query);
  }

  @Get('offers/:id')
  @Roles(...OFFER_READERS)
  @ApiOkResponse({ type: OfferDto })
  offer(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
  ): Promise<OfferDto> {
    return this.trade.offerOne(actor, id);
  }

  @Post('offers/:id/withdraw')
  @Roles(Role.BUYER)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: OfferDto })
  withdraw(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
  ): Promise<OfferDto> {
    return this.trade.withdrawOffer(actor, id);
  }

  @Post('offers/:id/reject')
  @Roles(Role.ADMIN, Role.SELLER)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: OfferDto })
  reject(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
  ): Promise<OfferDto> {
    return this.trade.rejectOffer(actor, id);
  }

  @Post('offers/:id/approve')
  @Roles(Role.ADMIN, Role.SELLER)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: OfferDto,
    description: 'A deal: the quantity is held until paid or past the deadline',
  })
  approve(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
  ): Promise<OfferDto> {
    return this.trade.approveOffer(actor, id);
  }

  @Post('offers/:id/cancel-deal')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: OfferDto,
    description: 'An unpaid deal; its quantity returns to the listing',
  })
  cancelDeal(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
  ): Promise<OfferDto> {
    return this.trade.cancelDeal(actor, id);
  }

  @Post('offers/:id/payment')
  @Roles(Role.ACCOUNTS)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: OfferDto,
    description: 'Before the deadline; a receipt part goes to the buyer',
  })
  confirmPayment(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
    @Body() dto: PaymentReferenceDto,
  ): Promise<OfferDto> {
    return this.trade.confirmPayment(actor, id, dto.paymentReference);
  }

  @Post('offers/:id/seller-payout')
  @Roles(Role.ACCOUNTS)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: OfferDto,
    description:
      'The external seller was paid the deal amount less the seller fee',
  })
  sellerPayout(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
    @Body() dto: PaymentReferenceDto,
  ): Promise<OfferDto> {
    return this.trade.recordSellerPayout(actor, id, dto.paymentReference);
  }

  @Post('offers/:id/delivery')
  @Roles(Role.BUYER, Role.WAREHOUSE, Role.FIELD_OFFICER, Role.SELLER)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: OfferDto,
    description: 'Buyer and handler each confirm; both done = delivered',
  })
  confirmDelivery(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
    @Body() dto: ConfirmDeliveryDto,
  ): Promise<OfferDto> {
    return this.trade.confirmDelivery(actor, id, dto);
  }

  @Get('offers/:id/deliveries/:side/photo')
  @Roles(...OFFER_READERS)
  @ApiFile('image/jpeg', 'image/png', 'image/webp')
  async deliveryPhoto(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
    @Param('side', new ParseEnumPipe(DeliverySide)) side: DeliverySide,
    @Res() res: Response,
  ): Promise<void> {
    const photo = await this.trade.deliveryPhoto(actor, id, side);
    await this.photos.send(photo, res);
  }

  // --- Buyer requests ---

  @Get('buyer-requests')
  @ApiPaged()
  @Roles(Role.BUYER, Role.SELLER, Role.FIELD_OFFICER, ...STAFF)
  @ApiOkResponse({
    type: [BuyerRequestDto],
    description: 'Open requests by default, each with matching listings',
  })
  listRequests(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListRequestsQueryDto,
  ): Promise<Paginated<BuyerRequestDto>> {
    return this.requests.list(actor, query);
  }

  @Post('buyer-requests')
  @Roles(Role.BUYER)
  @ApiCreatedResponse({ type: BuyerRequestDto })
  postRequest(
    @CurrentUser() actor: AuthUser,
    @Body() dto: PostRequestDto,
  ): Promise<BuyerRequestDto> {
    return this.requests.post(actor, dto);
  }

  @Post('buyer-requests/:id/cancel')
  @Roles(Role.BUYER)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: BuyerRequestDto })
  cancelRequest(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
  ): Promise<BuyerRequestDto> {
    return this.requests.cancel(actor, id);
  }
}
