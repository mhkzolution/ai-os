import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard, type RequestWithClient } from '../clients/api-key.guard';
import { RateLimitGuard } from '../clients/rate-limit.guard';
import { CreateJobDto } from './dto/create-job.dto';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@ApiSecurity('apiKey')
@UseGuards(ApiKeyGuard, RateLimitGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  create(@Req() req: RequestWithClient, @Body() dto: CreateJobDto) {
    const requestId = String(req.headers['x-request-id'] ?? '');
    return this.jobsService.create(req.client, dto, requestId);
  }

  @Get(':id')
  findOne(@Req() req: RequestWithClient, @Param('id') id: string) {
    return this.jobsService.findForClient(id, req.client.id);
  }
}
