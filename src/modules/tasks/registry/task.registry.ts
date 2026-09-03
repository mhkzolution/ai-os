import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ModelPurpose } from '../../../../generated/prisma/enums';
import { ProductAnalysisHandler } from '../handlers/product-analysis.handler';
import { ProductAnalysisInput } from '../schemas/product-analysis.input';
import { ProductAnalysisOutput } from '../schemas/product-analysis.output';
import { TaskOutputInvalidError } from '../task-output-invalid.error';

export type TaskDefinition = {
  code: string;
  purpose: ModelPurpose;
  promptKeyDefault: string;
  method: 'analyzeImage';
  validateInput(input: unknown): ProductAnalysisInput;
  validateOutput(output: unknown): ProductAnalysisOutput;
  handler: ProductAnalysisHandler;
};

@Injectable()
export class TaskRegistry {
  private readonly definitions: Map<string, TaskDefinition>;

  constructor(productAnalysis: ProductAnalysisHandler) {
    this.definitions = new Map([
      [
        'PRODUCT_ANALYSIS',
        {
          code: 'PRODUCT_ANALYSIS',
          purpose: ModelPurpose.VISION,
          promptKeyDefault: 'PRODUCT_ANALYZER',
          method: 'analyzeImage',
          handler: productAnalysis,
          validateInput: (input: unknown) => {
            const instance = plainToInstance(ProductAnalysisInput, input ?? {});
            const errors = validateSync(instance, { whitelist: true });
            if (errors.length > 0) {
              throw new UnprocessableEntityException(
                'images must be a non-empty array of urls',
              );
            }
            return instance;
          },
          validateOutput: (output: unknown) => {
            const instance = plainToInstance(
              ProductAnalysisOutput,
              output ?? {},
            );
            const errors = validateSync(instance, { whitelist: true });
            if (errors.length > 0) {
              throw new TaskOutputInvalidError(output);
            }
            return instance;
          },
        },
      ],
    ]);
  }

  get(code: string): TaskDefinition {
    const definition = this.definitions.get(code);
    if (!definition) {
      throw new UnprocessableEntityException(`Unknown taskCode: ${code}`);
    }
    return definition;
  }
}
