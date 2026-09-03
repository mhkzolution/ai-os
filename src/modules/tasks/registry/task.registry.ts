import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ProductAnalysisInput } from '../schemas/product-analysis.input';

export type TaskDefinition = {
  code: string;
  validateInput(input: unknown): unknown;
};

@Injectable()
export class TaskRegistry {
  private readonly definitions = new Map<string, TaskDefinition>([
    [
      'PRODUCT_ANALYSIS',
      {
        code: 'PRODUCT_ANALYSIS',
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
      },
    ],
  ]);

  get(code: string): TaskDefinition {
    const definition = this.definitions.get(code);
    if (!definition) {
      throw new UnprocessableEntityException(`Unknown taskCode: ${code}`);
    }
    return definition;
  }
}
