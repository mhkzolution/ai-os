import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ModelPurpose } from '../../../../generated/prisma/enums';

export class UpdateModelDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(ModelPurpose)
  purpose?: ModelPurpose;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  inputPricePer1k?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  outputPricePer1k?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
