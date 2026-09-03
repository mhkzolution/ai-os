import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

export const REPORT_GROUP_BY = ['day', 'client', 'provider'] as const;
export type ReportGroupBy = (typeof REPORT_GROUP_BY)[number];

export class ReportingQueryDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsString()
  modelId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(REPORT_GROUP_BY)
  groupBy?: ReportGroupBy;

  @IsOptional()
  @Transform(
    ({ value }) => value === true || value === 'true' || value === '1',
  )
  @IsBoolean()
  includePlayground?: boolean;
}
