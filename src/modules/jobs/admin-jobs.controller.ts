import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminJobsQueryDto } from './dto/admin-jobs-query.dto';
import { JobsService } from './jobs.service';

@ApiTags('admin-jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/jobs')
export class AdminJobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  list(@Query() query: AdminJobsQueryDto) {
    return this.jobsService.adminList(query);
  }
}
