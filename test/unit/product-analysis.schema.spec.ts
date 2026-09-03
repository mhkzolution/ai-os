import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { FAKE_PRODUCT_ANALYSIS_OUTPUT } from '../../src/shared/ai/fake.provider';
import { ProductAnalysisInput } from '../../src/modules/tasks/schemas/product-analysis.input';
import { ProductAnalysisOutput } from '../../src/modules/tasks/schemas/product-analysis.output';

describe('PRODUCT_ANALYSIS input schema', () => {
  it('accepts a non-empty array of https urls', () => {
    const input = plainToInstance(ProductAnalysisInput, {
      images: ['https://example.com/a.jpg'],
    });
    expect(validateSync(input)).toHaveLength(0);
  });

  it('rejects an empty images array', () => {
    const input = plainToInstance(ProductAnalysisInput, { images: [] });
    expect(validateSync(input).length).toBeGreaterThan(0);
  });
});

describe('PRODUCT_ANALYSIS output schema', () => {
  it('accepts the frozen FakeAIProvider PRODUCT_ANALYSIS shape', () => {
    const output = plainToInstance(
      ProductAnalysisOutput,
      FAKE_PRODUCT_ANALYSIS_OUTPUT,
    );
    expect(validateSync(output)).toHaveLength(0);
  });

  it('rejects { brand: 123 }', () => {
    const output = plainToInstance(ProductAnalysisOutput, { brand: 123 });
    expect(validateSync(output).length).toBeGreaterThan(0);
  });
});
