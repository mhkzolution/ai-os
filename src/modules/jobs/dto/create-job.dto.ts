import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class CreateJobDto {
  @IsString()
  @IsNotEmpty()
  taskCode: string;

  @IsObject()
  input: Record<string, unknown>;
}
