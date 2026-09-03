import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ReportingQueryDto } from '../usage/dto/reporting-query.dto';
import { CostsService } from './costs.service';

@ApiTags('costs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('costs')
export class CostsController {
  constructor(private readonly costs: CostsService) {}

  @Get()
  report(@Query() query: ReportingQueryDto) {
    return this.costs.report(query);
  }
}
