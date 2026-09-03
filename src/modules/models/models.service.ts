import { Injectable, NotFoundException } from '@nestjs/common';
import { throwIfPrismaConflict } from '../../shared/prisma/prisma-errors';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateModelDto } from './dto/create-model.dto';
import { UpdateModelDto } from './dto/update-model.dto';

@Injectable()
export class ModelsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateModelDto) {
    const provider = await this.prisma.provider.findUnique({
      where: { id: dto.providerId },
    });
    if (!provider) {
      throw new NotFoundException(`Provider ${dto.providerId} not found`);
    }
    try {
      return await this.prisma.model.create({
        data: {
          providerId: dto.providerId,
          name: dto.name,
          purpose: dto.purpose,
          inputPricePer1k: dto.inputPricePer1k,
          outputPricePer1k: dto.outputPricePer1k,
          currency: dto.currency ?? 'USD',
          isActive: dto.isActive ?? true,
        },
      });
    } catch (error) {
      throwIfPrismaConflict(
        error,
        'Model name already exists for this provider',
      );
    }
  }

  findAll() {
    return this.prisma.model.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async findOne(id: string) {
    const model = await this.prisma.model.findUnique({ where: { id } });
    if (!model) {
      throw new NotFoundException(`Model ${id} not found`);
    }
    return model;
  }

  async update(id: string, dto: UpdateModelDto) {
    await this.findOne(id);
    return this.prisma.model.update({
      where: { id },
      data: {
        name: dto.name,
        purpose: dto.purpose,
        inputPricePer1k: dto.inputPricePer1k,
        outputPricePer1k: dto.outputPricePer1k,
        currency: dto.currency,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.model.delete({ where: { id } });
    return { id };
  }
}
