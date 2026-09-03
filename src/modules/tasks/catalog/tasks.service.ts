import { Injectable, NotFoundException } from '@nestjs/common';
import { throwIfPrismaConflict } from '../../../shared/prisma/prisma-errors';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTaskDto) {
    try {
      return await this.prisma.task.create({
        data: {
          code: dto.code,
          name: dto.name,
          description: dto.description,
          promptKey: dto.promptKey,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (error) {
      throwIfPrismaConflict(error, 'Task code already exists');
    }
  }

  findAll() {
    return this.prisma.task.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    return task;
  }

  async update(id: string, dto: UpdateTaskDto) {
    await this.findOne(id);
    return this.prisma.task.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        promptKey: dto.promptKey,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.task.delete({ where: { id } });
    return { id };
  }
}
