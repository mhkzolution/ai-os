import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Role } from '../../../generated/prisma/enums';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ExecutePlaygroundDto } from './dto/execute-playground.dto';
import { PlaygroundService } from './playground.service';

@ApiTags('playground')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('playground')
export class PlaygroundController {
  constructor(private readonly playground: PlaygroundService) {}

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  execute(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Body() dto: ExecutePlaygroundDto,
  ) {
    const requestId = String(req.headers['x-request-id'] ?? '');
    return this.playground.execute(user.id, dto, requestId);
  }
}
