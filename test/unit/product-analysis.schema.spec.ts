import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ProductAnalysisInput } from '../../src/modules/tasks/schemas/product-analysis.input';

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
