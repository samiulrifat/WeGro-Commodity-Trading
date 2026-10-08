import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthResponseDto } from './dto/health-response.dto';
import { HealthService } from './health.service';

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOkResponse({
    type: HealthResponseDto,
    description: 'The API and its database are up.',
  })
  @ApiServiceUnavailableResponse({
    description: 'The database cannot be reached.',
  })
  async check(): Promise<HealthResponseDto> {
    const result = await this.health.check();
    if (result.database === 'down')
      throw new ServiceUnavailableException('Database unavailable');
    return result;
  }
}
