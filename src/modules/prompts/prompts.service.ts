import { Injectable, NotFoundException } from '@nestjs/common';
import { throwIfPrismaConflict } from '../../shared/prisma/prisma-errors';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreatePromptDto } from './dto/create-prompt.dto';
import { UpdatePromptDto } from './dto/update-prompt.dto';

@Injectable()
export class PromptsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePromptDto, createdById?: string) {
    try {
      return await this.prisma.prompt.create({
        data: {
          key: dto.key,
          version: dto.version,
          content: dto.content,
          description: dto.description,
          isActive: false,
          createdById,
        },
      });
    } catch (error) {
      throwIfPrismaConflict(error, 'Prompt key+version already exists');
    }
  }

  findAll() {
    return this.prisma.prompt.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async findOne(id: string) {
    const prompt = await this.prisma.prompt.findUnique({ where: { id } });
    if (!prompt) {
      throw new NotFoundException(`Prompt ${id} not found`);
    }
    return prompt;
  }

  async update(id: string, dto: UpdatePromptDto) {
    await this.findOne(id);
    return this.prisma.prompt.update({
      where: { id },
      data: {
        content: dto.content,
        description: dto.description,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.prompt.delete({ where: { id } });
  }

  async activate(id: string) {
    const prompt = await this.prisma.prompt.findUnique({ where: { id } });
    if (!prompt) {
      throw new NotFoundException(`Prompt ${id} not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.prompt.updateMany({
        where: { key: prompt.key, isActive: true, id: { not: id } },
        data: { isActive: false },
      });
      return tx.prompt.update({
        where: { id },
        data: { isActive: true },
      });
    });
  }
}
