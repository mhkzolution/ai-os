import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ModelPurpose } from '../../../../generated/prisma/enums';

export class CreateModelDto {
  @IsString()
  @IsNotEmpty()
  providerId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(ModelPurpose)
  purpose: ModelPurpose;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  inputPricePer1k: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  outputPricePer1k: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
