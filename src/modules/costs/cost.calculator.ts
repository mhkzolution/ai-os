export type PriceSnapshot = {
  inputPricePer1k: number;
  outputPricePer1k: number;
};

export function calculateCost(
  tokensInput: number,
  tokensOutput: number,
  snapshot: PriceSnapshot,
): number {
  return (
    (tokensInput / 1000) * snapshot.inputPricePer1k +
    (tokensOutput / 1000) * snapshot.outputPricePer1k
  );
}
