import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
  RejectProofDto,
  SubmitProofDto,
} from '../projects/dto/payment-proof.dto';
import { PaymentMethod } from '../projects/payment-proof.enums';
import { MAX_PROOF_BYTES, MAX_PROOF_FILES } from '../projects/proof-files';
import { Role } from '../users/roles';
import { ClaimProofsService } from './claim-proofs.service';
import { ClaimProofDto, ListClaimProofsQueryDto } from './dto/claim-proof.dto';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });
const PAYMENT_STAFF = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.ACCOUNTS,
  Role.AUDITOR,
];

/**
 * Proof of payment for approved claims: the project's insurer sends photos
 * or PDFs with the amount; Accounts accepts each against the bank statement
 * or rejects it.
 */
@ApiTags('Insurance')
@ApiBearerAuth()
@Controller()
export class ClaimProofsController {
  constructor(private readonly proofs: ClaimProofsService) {}

  @Post('insurance/claims/:id/proofs')
  @Roles(Role.INSURER)
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
    type: ClaimProofDto,
    description: 'Under review until Accounts decides',
  })
  submit(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: SubmitProofDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ): Promise<ClaimProofDto> {
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

  @Get('insurance/claims/:id/proofs')
  @Roles(Role.INSURER, ...PAYMENT_STAFF)
  @ApiOkResponse({ type: [ClaimProofDto], description: 'Newest first' })
  forClaim(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<ClaimProofDto[]> {
    return this.proofs.forClaim(actor, id);
  }

  @Get('claim-proofs')
  @ApiPaged()
  @Roles(...PAYMENT_STAFF)
  @ApiOkResponse({
    type: [ClaimProofDto],
    description: 'Waiting ones oldest first',
  })
  list(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListClaimProofsQueryDto,
  ): Promise<Paginated<ClaimProofDto>> {
    return this.proofs.list(actor, query);
  }

  @Post('claim-proofs/:id/accept')
  @Roles(Role.ACCOUNTS)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ClaimProofDto,
    description:
      "When accepted proofs cover the approved amount, the claim's payment is recorded on the ledger",
  })
  accept(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: AcceptProofDto,
  ): Promise<ClaimProofDto> {
    return this.proofs.accept(actor, id, dto.paymentReference);
  }

  @Post('claim-proofs/:id/reject')
  @Roles(Role.ACCOUNTS)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ClaimProofDto })
  reject(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: RejectProofDto,
  ): Promise<ClaimProofDto> {
    return this.proofs.reject(actor, id, dto.reason);
  }

  @Get('claim-proofs/files/:fileId')
  @Roles(Role.INSURER, ...PAYMENT_STAFF)
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
