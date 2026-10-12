import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  NotFoundException,
  Param,
  type PipeTransform,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotModifiedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../auth/decorators';
import { Role } from '../users/roles';
import { CODE_PATTERN } from './catalog.enums';
import { CatalogService } from './catalog.service';
import {
  CatalogQueryDto,
  CreateFieldRecordTypeDto,
  CreateInputTypeDto,
  CreateProduceTypeDto,
  CreateUnitDto,
  CreateWeatherEventTypeDto,
  UpdateFieldRecordTypeDto,
  UpdateInputTypeDto,
  UpdateProduceTypeDto,
  UpdateUnitDto,
  UpdateWeatherEventTypeDto,
} from './dto/catalog-request.dto';
import {
  CatalogDto,
  FieldRecordTypeDto,
  InputTypeDto,
  ProduceTypeDto,
  UnitDto,
  WeatherEventTypeDto,
} from './dto/catalog-response.dto';

/** A malformed code can never exist: answer 404 without a lookup. */
class CodePipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!CODE_PATTERN.test(value)) throw new NotFoundException();
    return value;
  }
}

const EDITORS = [Role.SuperAdmin, Role.Admin, Role.Operations];

@ApiTags('Catalog')
@ApiBearerAuth()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /**
   * The whole catalog for dropdowns. Send the last ETag as If-None-Match:
   * an unchanged catalog answers 304 with no body, so phones re-download it
   * only when something changed.
   */
  @Get()
  @ApiOkResponse({ type: CatalogDto })
  @ApiNotModifiedResponse({ description: 'Unchanged since the ETag sent' })
  get(
    @Query() query: CatalogQueryDto,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): CatalogDto | undefined {
    const bundle = this.catalog.bundle(query.includeInactive === true);
    const etag = `"${bundle.version}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, no-cache');
    if (ifNoneMatch?.split(',').some((t) => t.trim() === etag)) {
      res.status(HttpStatus.NOT_MODIFIED);
      return undefined;
    }
    return bundle;
  }

  @Post('units')
  @Roles(...EDITORS)
  @ApiCreatedResponse({ type: UnitDto })
  createUnit(@Body() dto: CreateUnitDto): Promise<UnitDto> {
    return this.catalog.createUnit(dto);
  }

  @Patch('units/:code')
  @Roles(...EDITORS)
  @ApiOkResponse({ type: UnitDto })
  updateUnit(
    @Param('code', CodePipe) code: string,
    @Body() dto: UpdateUnitDto,
  ): Promise<UnitDto> {
    return this.catalog.updateUnit(code, dto);
  }

  @Post('produce-types')
  @Roles(...EDITORS)
  @ApiCreatedResponse({ type: ProduceTypeDto })
  createProduceType(
    @Body() dto: CreateProduceTypeDto,
  ): Promise<ProduceTypeDto> {
    return this.catalog.createProduceType(dto);
  }

  @Patch('produce-types/:code')
  @Roles(...EDITORS)
  @ApiOkResponse({ type: ProduceTypeDto })
  updateProduceType(
    @Param('code', CodePipe) code: string,
    @Body() dto: UpdateProduceTypeDto,
  ): Promise<ProduceTypeDto> {
    return this.catalog.updateProduceType(code, dto);
  }

  @Post('input-types')
  @Roles(...EDITORS)
  @ApiCreatedResponse({ type: InputTypeDto })
  createInputType(@Body() dto: CreateInputTypeDto): Promise<InputTypeDto> {
    return this.catalog.createInputType(dto);
  }

  @Patch('input-types/:code')
  @Roles(...EDITORS)
  @ApiOkResponse({ type: InputTypeDto })
  updateInputType(
    @Param('code', CodePipe) code: string,
    @Body() dto: UpdateInputTypeDto,
  ): Promise<InputTypeDto> {
    return this.catalog.updateInputType(code, dto);
  }

  @Post('field-record-types')
  @Roles(...EDITORS)
  @ApiCreatedResponse({ type: FieldRecordTypeDto })
  createFieldRecordType(
    @Body() dto: CreateFieldRecordTypeDto,
  ): Promise<FieldRecordTypeDto> {
    return this.catalog.createFieldRecordType(dto);
  }

  @Patch('field-record-types/:code')
  @Roles(...EDITORS)
  @ApiOkResponse({ type: FieldRecordTypeDto })
  updateFieldRecordType(
    @Param('code', CodePipe) code: string,
    @Body() dto: UpdateFieldRecordTypeDto,
  ): Promise<FieldRecordTypeDto> {
    return this.catalog.updateFieldRecordType(code, dto);
  }

  @Post('weather-event-types')
  @Roles(...EDITORS)
  @ApiCreatedResponse({ type: WeatherEventTypeDto })
  createWeatherEventType(
    @Body() dto: CreateWeatherEventTypeDto,
  ): Promise<WeatherEventTypeDto> {
    return this.catalog.createWeatherEventType(dto);
  }

  @Patch('weather-event-types/:code')
  @Roles(...EDITORS)
  @ApiOkResponse({ type: WeatherEventTypeDto })
  updateWeatherEventType(
    @Param('code', CodePipe) code: string,
    @Body() dto: UpdateWeatherEventTypeDto,
  ): Promise<WeatherEventTypeDto> {
    return this.catalog.updateWeatherEventType(code, dto);
  }
}
