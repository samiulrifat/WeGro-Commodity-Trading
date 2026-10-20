import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Paginated } from '../../common/dto/pagination.dto';
import { ErrorCode } from '../../common/errors/error-code';
import { ApiPaged } from '../../common/swagger/envelope';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { Role } from '../users/roles';
import {
  AcceptProofDto,
  ListProofsQueryDto,
  PaymentProofDto,
  ProofRefundDto,
  RejectProofDto,
  SubmitProofDto,
} from './dto/payment-proof.dto';
import { PaymentMethod } from './payment-proof.enums';
import { PaymentProofsService } from './payment-proofs.service';
import { MAX_PROOF_BYTES, MAX_PROOF_FILES } from './proof-files';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });
const reservationId = new ParseIntPipe({
  errorHttpStatusCode: HttpStatus.NOT_FOUND,
});
const PAYMENT_STAFF = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.ACCOUNTS,
  Role.AUDITOR,
];

/**
 * Proof of payment for bookings: the investor sends photos or PDFs with
 * the amount; Accounts accepts each against the bank statement or rejects it.
 */
@ApiTags('Payment proofs')
@ApiBearerAuth()
@Controller()
export class PaymentProofsController {
  constructor(private readonly proofs: PaymentProofsService) {}

  @Post('reservations/:id/proofs')
  @Roles(Role.INVESTOR)
  @UseInterceptors(
    FilesInterceptor('files', MAX_PROOF_FILES, {
      limits: { fileSize: MAX_PROOF_BYTES, files: MAX_PROOF_FILES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files', 'amount', 'transferredOn', 'method'],
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: `1 to ${MAX_PROOF_FILES} photos or PDFs, up to 10 MB each`,
        },
        amount: { type: 'string', example: '100000' },
        transferredOn: { type: 'string', format: 'date' },
        method: { type: 'string', enum: Object.values(PaymentMethod) },
        bankCode: { type: 'integer', description: 'Deposit or cheque' },
        reference: { type: 'string' },
        note: { type: 'string' },
      },
    },
  })
  @ApiCreatedResponse({
    type: PaymentProofDto,
    description:
      'Under review; the booking’s clock stops until Accounts decides',
  })
  submit(
    @CurrentUser() actor: AuthUser,
    @Param('id', reservationId) id: number,
    @Body() dto: SubmitProofDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ): Promise<PaymentProofDto> {
    if (!files || files.length === 0) {
      throw new BadRequestException({
        message: 'Attach the proof as "files"',
        code: ErrorCode.PROOF_FILE_COUNT,
        details: { max: MAX_PROOF_FILES },
      });
    }
    return this.proofs.submit(
      actor,
      id,
      dto,
      files.map((f) => f.buffer),
    );
  }

  @Get('reservations/:id/proofs')
  @Roles(Role.INVESTOR, ...PAYMENT_STAFF)
  @ApiOkResponse({ type: [PaymentProofDto], description: 'Newest first' })
  forReservation(
    @CurrentUser() actor: AuthUser,
    @Param('id', reservationId) id: number,
  ): Promise<PaymentProofDto[]> {
    return this.proofs.forReservation(actor, id);
  }

  @Get('payment-proofs')
  @ApiPaged()
  @Roles(...PAYMENT_STAFF)
  @ApiOkResponse({
    type: [PaymentProofDto],
    description: 'Waiting ones oldest first; others newest first',
  })
  list(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListProofsQueryDto,
  ): Promise<Paginated<PaymentProofDto>> {
    return this.proofs.list(actor, query);
  }

  @Post('payment-proofs/:id/accept')
  @Roles(Role.ACCOUNTS)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: PaymentProofDto,
    description:
      'When accepted proofs cover the amount, the booking is confirmed on the ledger',
  })
  accept(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: AcceptProofDto,
  ): Promise<PaymentProofDto> {
    return this.proofs.accept(actor, id, dto.paymentReference);
  }

  @Post('payment-proofs/:id/reject')
  @Roles(Role.ACCOUNTS)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PaymentProofDto })
  reject(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: RejectProofDto,
  ): Promise<PaymentProofDto> {
    return this.proofs.reject(actor, id, dto.reason);
  }

  @Post('payment-proofs/:id/refund')
  @Roles(Role.ACCOUNTS)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: PaymentProofDto,
    description:
      'Money accepted for a booking that ended unconfirmed, paid back',
  })
  refund(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: ProofRefundDto,
  ): Promise<PaymentProofDto> {
    return this.proofs.recordRefund(actor, id, dto.paymentReference);
  }

  @Get('payment-proofs/files/:fileId')
  @Roles(Role.INVESTOR, ...PAYMENT_STAFF)
  @ApiProduces('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  @ApiOkResponse({ description: 'The file, decrypted' })
  async file(
    @CurrentUser() actor: AuthUser,
    @Param('fileId', uuid) fileId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { data, mimeType } = await this.proofs.file(actor, fileId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(data.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(data);
  }
}
