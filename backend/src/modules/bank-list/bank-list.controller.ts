import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorCode } from '../../common/errors/error-code';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { Role } from '../users/roles';
import { BankListService } from './bank-list.service';
import {
  BankListStatusDto,
  BranchDto,
  ListedBankDto,
  ListedBranchDto,
  ListedDistrictDto,
} from './dto/bank-list.dto';

/** Each file of an import; the official branches file is about 3 MB. */
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const code = new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

/**
 * Bangladesh's banks and branches, for picking where a payee is paid:
 * bank, then district, then branch, whose routing number comes from here.
 */
@ApiTags('Bank list')
@ApiBearerAuth()
@Controller('bank-list')
export class BankListController {
  constructor(private readonly list: BankListService) {}

  @Get()
  @ApiOkResponse({ type: BankListStatusDto })
  status(): Promise<BankListStatusDto> {
    return this.list.status();
  }

  @Get('banks')
  @ApiOkResponse({ type: [ListedBankDto], description: 'By name' })
  banks(): Promise<ListedBankDto[]> {
    return this.list.banks();
  }

  @Get('banks/:bankCode/districts')
  @ApiOkResponse({
    type: [ListedDistrictDto],
    description: 'Where the bank has branches, by name',
  })
  districts(
    @Param('bankCode', code) bankCode: number,
  ): Promise<ListedDistrictDto[]> {
    return this.list.districts(bankCode);
  }

  @Get('banks/:bankCode/districts/:districtCode/branches')
  @ApiOkResponse({ type: [ListedBranchDto], description: 'By name' })
  branches(
    @Param('bankCode', code) bankCode: number,
    @Param('districtCode', code) districtCode: number,
  ): Promise<ListedBranchDto[]> {
    return this.list.branches(bankCode, districtCode);
  }

  @Get('branches/:routingNumber')
  @ApiOkResponse({ type: BranchDto })
  branch(@Param('routingNumber') routingNumber: string): Promise<BranchDto> {
    return this.list.branch(routingNumber);
  }

  @Post('import')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'branches', maxCount: 1 },
        { name: 'districts', maxCount: 1 },
      ],
      { limits: { fileSize: MAX_FILE_BYTES, files: 2 } },
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['branches'],
      properties: {
        branches: {
          type: 'string',
          format: 'binary',
          description: 'bank_branches.json: banks, each with its branches',
        },
        districts: {
          type: 'string',
          format: 'binary',
          description:
            'districts.json (optional): checked against the branches',
        },
      },
    },
  })
  @ApiOkResponse({
    type: BankListStatusDto,
    description:
      'Replaces the whole list. Bank details already entered keep their names.',
  })
  import(
    @CurrentUser() actor: AuthUser,
    @UploadedFiles()
    files: {
      branches?: Express.Multer.File[];
      districts?: Express.Multer.File[];
    } = {},
  ): Promise<BankListStatusDto> {
    const branches = files.branches?.[0];
    if (!branches) {
      throw new BadRequestException({
        message: 'Send the branches file as the "branches" field',
        code: ErrorCode.BANK_LIST_FILE_MISSING,
      });
    }
    return this.list.replace(actor, {
      branches: branches.buffer,
      districts: files.districts?.[0]?.buffer,
    });
  }
}
