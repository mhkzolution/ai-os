import { ArrayMinSize, IsArray, IsUrl } from 'class-validator';

export class ProductAnalysisInput {
  @IsArray()
  @ArrayMinSize(1)
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    { each: true },
  )
  images: string[];
}
