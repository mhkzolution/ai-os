import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Client, Job, Prisma } from '../../../generated/prisma/client';
import { JobStatus } from '../../../generated/prisma/enums';
import { AI_JOBS_QUEUE } from '../../shared/queue/queue.constants';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { TaskRegistry } from '../tasks/registry/task.registry';
import type { AdminJobsQueryDto } from './dto/admin-jobs-query.dto';

function toPublicJob(job: Job) {
  return {
    id: job.id,
    clientId: job.clientId,
    taskId: job.taskId,
    status: job.status,
    input: job.input,
    output: job.output,
    error: job.error,
    requestId: job.requestId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
  };
}

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskRegistry: TaskRegistry,
    @InjectQueue(AI_JOBS_QUEUE) private readonly queue: Queue,
  ) {}

  async create(
    client: Client,
    dto: { taskCode: string; input: unknown },
    requestId: string,
  ) {
    const definition = this.taskRegistry.get(dto.taskCode);
    const task = await this.prisma.task.findUnique({
      where: { code: dto.taskCode },
    });
    if (!task || !task.isActive) {
      throw new UnprocessableEntityException(
        `Unknown or inactive task: ${dto.taskCode}`,
      );
    }
    const input = definition.validateInput(dto.input);
    const job = await this.prisma.job.create({
      data: {
        clientId: client.id,
        taskId: task.id,
        status: JobStatus.PENDING,
        input: input as Prisma.InputJsonValue,
        requestId,
      },
    });
    await this.queue.add('run', { jobId: job.id }, { jobId: job.id });
    return toPublicJob(job);
  }

  async findForClient(id: string, clientId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id, clientId },
    });
    if (!job) {
      throw new NotFoundException();
    }
    return toPublicJob(job);
  }

  async adminList(query: AdminJobsQueryDto) {
    const where: Prisma.JobWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.clientId) {
      where.clientId = query.clientId;
    }
    if (query.taskId) {
      where.taskId = query.taskId;
    }
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {
        ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
        ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
      };
    }
    const take = query.limit ?? 50;
    const skip = query.offset ?? 0;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.job.count({ where }),
    ]);
    return { items: items.map(toPublicJob), total };
  }
}
