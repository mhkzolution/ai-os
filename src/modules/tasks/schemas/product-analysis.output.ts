import { ArrayMinSize, IsArray, IsNumber, IsString, Max, Min } from 'class-validator';

export class ProductAnalysisOutput {
  @IsString()
  productName: string;

  @IsString()
  brand: string;

  @IsString()
  category: string;

  @IsString()
  subcategory: string;

  @IsArray()
  @ArrayMinSize(0)
  @IsString({ each: true })
  tags: string[];

  @IsString()
  description: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;
}
