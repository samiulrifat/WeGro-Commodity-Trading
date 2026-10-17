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
} from './dto/trade.dto';
import { RequestsService } from './requests.service';
import { DeliverySide } from './trade.enums';
import { TradeService } from './trade.service';

const ledgerId = new ParseIntPipe({
  errorHttpStatusCode: HttpStatus.NOT_FOUND,
});
const STAFF = [
  Role.SuperAdmin,
  Role.Admin,
  Role.Operations,
  Role.Accounts,
  Role.Auditor,
];
const OFFER_READERS = [
  ...STAFF,
  Role.Buyer,
  Role.Farmer,
  Role.FieldOfficer,
  Role.Warehouse,
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
    @Query() query: ListListingsQueryDto,
  ): Promise<Paginated<ListingDto>> {
    return this.trade.listListings(query);
  }

  @Get('listings/:id')
  @ApiOkResponse({ type: ListingDto })
  listing(@Param('id', ledgerId) id: number): Promise<ListingDto> {
    return this.trade.listingOne(id);
  }

  @Post('listings/receipt')
  @Roles(Role.Admin, Role.FieldOfficer)
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
  @Roles(Role.Admin, Role.FieldOfficer)
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
  @Roles(Role.Admin, Role.FieldOfficer)
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
  @Roles(Role.Buyer)
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
  @Roles(Role.Buyer)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: OfferDto })
  withdraw(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
  ): Promise<OfferDto> {
    return this.trade.withdrawOffer(actor, id);
  }

  @Post('offers/:id/reject')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: OfferDto })
  reject(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
  ): Promise<OfferDto> {
    return this.trade.rejectOffer(actor, id);
  }

  @Post('offers/:id/approve')
  @Roles(Role.Admin)
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
  @Roles(Role.Admin)
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
  @Roles(Role.Accounts)
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

  @Post('offers/:id/delivery')
  @Roles(Role.Buyer, Role.Warehouse, Role.FieldOfficer)
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
  @Roles(Role.Buyer, Role.FieldOfficer, ...STAFF)
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
  @Roles(Role.Buyer)
  @ApiCreatedResponse({ type: BuyerRequestDto })
  postRequest(
    @CurrentUser() actor: AuthUser,
    @Body() dto: PostRequestDto,
  ): Promise<BuyerRequestDto> {
    return this.requests.post(actor, dto);
  }

  @Post('buyer-requests/:id/cancel')
  @Roles(Role.Buyer)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: BuyerRequestDto })
  cancelRequest(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
  ): Promise<BuyerRequestDto> {
    return this.requests.cancel(actor, id);
  }
}
