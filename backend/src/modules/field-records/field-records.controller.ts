import { ApiFile, ApiPaged } from '../../common/swagger/envelope';
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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Paginated } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { Role } from '../users/roles';
import {
  FieldRecordDto,
  FieldRecordVerificationDto,
  ListAllFieldRecordsQueryDto,
  ListFieldRecordsQueryDto,
  OfficerProjectDto,
  PhotoDto,
  SyncFieldRecordsDto,
  SyncResultDto,
} from './dto/field-record.dto';
import { FieldRecordsService } from './field-records.service';
import { MAX_PHOTO_BYTES, photoHash, PhotosService } from './photos.service';
import { ErrorCode } from '../../common/errors/error-code';

const uuid = new ParseUUIDPipe({ version: '4' });

/** Farm updates (FieldRecordLog): offline drafts synced from field officers' phones. */
@ApiTags('Field records')
@ApiBearerAuth()
@Controller()
export class FieldRecordsController {
  constructor(
    private readonly records: FieldRecordsService,
    private readonly photos: PhotosService,
  ) {}

  @Post('photos')
  @Roles(
    Role.FIELD_OFFICER,
    Role.BUYER,
    Role.WAREHOUSE,
    Role.INSURER,
    Role.ACCOUNTS,
    Role.SELLER,
  )
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({
    type: PhotoDto,
    description:
      'JPEG, PNG or WebP up to 10 MB; metadata removed. The same photo twice gives the same id.',
  })
  async upload(
    @CurrentUser() actor: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<PhotoDto> {
    if (!file)
      throw new BadRequestException({
        message: 'Send the photo as the "file" field',
        code: ErrorCode.PHOTO_FIELD_MISSING,
      });
    const photo = await this.photos.store(file.buffer, actor.id);
    return {
      id: photo.id,
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
      photoHash: photoHash(photo.sha256),
    };
  }

  @Post('field-records/sync')
  @Roles(Role.FIELD_OFFICER)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: [SyncResultDto],
    description:
      'One outcome per draft, in the order sent. Safe to send again.',
  })
  sync(
    @CurrentUser() actor: AuthUser,
    @Body() dto: SyncFieldRecordsDto,
  ): Promise<SyncResultDto[]> {
    return this.records.sync(actor, dto.records);
  }

  @Get('projects/:projectId/field-records')
  @ApiPaged()
  @ApiOkResponse({
    type: [FieldRecordDto],
    description: 'Newest observation first',
  })
  list(
    @CurrentUser() actor: AuthUser,
    @Param('projectId', uuid) projectId: string,
    @Query() query: ListFieldRecordsQueryDto,
  ): Promise<Paginated<FieldRecordDto>> {
    return this.records.list(actor, projectId, query);
  }

  @Get('field-records')
  @ApiPaged()
  @Roles(
    Role.FIELD_OFFICER,
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.OPERATIONS,
    Role.ACCOUNTS,
    Role.AUDITOR,
  )
  @ApiOkResponse({
    type: [FieldRecordDto],
    description:
      "Newest observation first: a field officer's own, or every one for staff",
  })
  listAll(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListAllFieldRecordsQueryDto,
  ): Promise<Paginated<FieldRecordDto>> {
    return this.records.listAll(actor, query);
  }

  @Get('field-records/my-projects')
  @Roles(Role.FIELD_OFFICER)
  @ApiOkResponse({
    type: [OfficerProjectDto],
    description:
      "Your farmers' projects that take farm updates now (funded to ready for sale)",
  })
  myProjects(@CurrentUser() actor: AuthUser): Promise<OfficerProjectDto[]> {
    return this.records.officerProjects(actor);
  }

  @Get('field-records/:id')
  @ApiOkResponse({ type: FieldRecordDto })
  findOne(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<FieldRecordDto> {
    return this.records.findOne(actor, id);
  }

  @Get('field-records/:id/photo')
  @ApiFile('image/jpeg', 'image/png', 'image/webp')
  @ApiOkResponse({ description: 'The photo, as fingerprinted on the ledger' })
  async photo(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const photo = await this.records.photoFor(actor, id);
    await this.photos.send(photo, res);
  }

  @Get('field-records/:id/verify')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.AUDITOR)
  @ApiOkResponse({ type: FieldRecordVerificationDto })
  verify(@Param('id', uuid) id: string): Promise<FieldRecordVerificationDto> {
    return this.records.verify(id);
  }
}
