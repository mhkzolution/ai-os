import { calculateCost } from '../../src/modules/costs/cost.calculator';

it('does not use a later model price', () => {
  const snapshot = { inputPricePer1k: 0.01, outputPricePer1k: 0.03 };
  const amount = calculateCost(1000, 1000, snapshot);
  const currentModelPrice = { inputPricePer1k: 0.02, outputPricePer1k: 0.05 };
  expect(amount).toBe(0.04);
  expect(amount).not.toBe(calculateCost(1000, 1000, currentModelPrice));
});
