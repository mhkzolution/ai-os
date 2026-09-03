import { IsObject, IsString } from 'class-validator';

export class ExecutePlaygroundDto {
  @IsString()
  providerId: string;

  @IsString()
  modelId: string;

  @IsString()
  promptId: string;

  @IsObject()
  input: Record<string, unknown>;
}
