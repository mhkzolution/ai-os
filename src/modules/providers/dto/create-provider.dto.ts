import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ProviderType } from '../../../../generated/prisma/enums';

export class CreateProviderDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(ProviderType)
  type: ProviderType;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Type(() => Number)
  @IsInt()
  priority: number;
}
