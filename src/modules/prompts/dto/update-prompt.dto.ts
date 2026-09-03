import { IsOptional, IsString } from 'class-validator';

export class UpdatePromptDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
