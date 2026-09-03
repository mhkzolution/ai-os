import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreatePromptDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsString()
  description?: string;
}
