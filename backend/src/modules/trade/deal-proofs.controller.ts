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
import {
  AcceptProofDto,
  ListProofsQueryDto,
  ProofRefundDto,
  RejectProofDto,
  SubmitProofDto,
} from '../projects/dto/payment-proof.dto';
import { PaymentMethod } from '../projects/payment-proof.enums';
import { MAX_PROOF_BYTES, MAX_PROOF_FILES } from '../projects/proof-files';
import { Role } from '../users/roles';
import { DealProofsService } from './deal-proofs.service';
import { DealProofDto } from './dto/deal-proof.dto';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });
const offerId = new ParseIntPipe({
  errorHttpStatusCode: HttpStatus.NOT_FOUND,
});
const PAYMENT_STAFF = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.ACCOUNTS,
  Role.AUDITOR,
];

/**
 * Proof of payment for deals: the buyer sends photos or PDFs with the
 * amount; Accounts accepts each against the bank statement or rejects it.
 */
@ApiTags('Marketplace')
@ApiBearerAuth()
@Controller()
export class DealProofsController {
  constructor(private readonly proofs: DealProofsService) {}

  @Post('offers/:id/proofs')
  @Roles(Role.BUYER)
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
        routingNumber: {
          type: 'string',
          pattern: '^\\d{9}$',
          description: 'The branch paid from (deposit or cheque)',
        },
        reference: { type: 'string' },
        note: { type: 'string' },
      },
    },
  })
  @ApiCreatedResponse({
    type: DealProofDto,
    description: 'Under review; the deal’s clock stops until Accounts decides',
  })
  submit(
    @CurrentUser() actor: AuthUser,
    @Param('id', offerId) id: number,
    @Body() dto: SubmitProofDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ): Promise<DealProofDto> {
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

  @Get('offers/:id/proofs')
  @Roles(Role.BUYER, ...PAYMENT_STAFF)
  @ApiOkResponse({ type: [DealProofDto], description: 'Newest first' })
  forOffer(
    @CurrentUser() actor: AuthUser,
    @Param('id', offerId) id: number,
  ): Promise<DealProofDto[]> {
    return this.proofs.forOffer(actor, id);
  }

  @Get('deal-proofs')
  @ApiPaged()
  @Roles(...PAYMENT_STAFF)
  @ApiOkResponse({
    type: [DealProofDto],
    description: 'Waiting ones oldest first; or refunds due',
  })
  list(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListProofsQueryDto,
  ): Promise<Paginated<DealProofDto>> {
    return this.proofs.list(actor, query);
  }

  @Post('deal-proofs/:id/accept')
  @Roles(Role.ACCOUNTS)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: DealProofDto,
    description:
      'When accepted proofs cover what the buyer pays, the deal is confirmed on the ledger',
  })
  accept(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: AcceptProofDto,
  ): Promise<DealProofDto> {
    return this.proofs.accept(actor, id, dto.paymentReference);
  }

  @Post('deal-proofs/:id/reject')
  @Roles(Role.ACCOUNTS)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DealProofDto })
  reject(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: RejectProofDto,
  ): Promise<DealProofDto> {
    return this.proofs.reject(actor, id, dto.reason);
  }

  @Post('deal-proofs/:id/refund')
  @Roles(Role.ACCOUNTS)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: DealProofDto,
    description: 'Money accepted for a deal that ended unpaid, paid back',
  })
  refund(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: ProofRefundDto,
  ): Promise<DealProofDto> {
    return this.proofs.recordRefund(actor, id, dto.paymentReference);
  }

  @Get('deal-proofs/files/:fileId')
  @Roles(Role.BUYER, ...PAYMENT_STAFF)
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
