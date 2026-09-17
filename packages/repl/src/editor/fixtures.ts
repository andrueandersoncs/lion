export type FixtureShape = "deep" | "wide";

const assertSize = (totalNodes: number) => {
  if (!(Number.isInteger(totalNodes) && totalNodes > 0)) {
    throw new RangeError("Fixture size must be a positive integer.");
  }
};

export const createSyntheticProgram = (
  totalNodes: number,
  shape: FixtureShape = "wide"
): unknown => {
  assertSize(totalNodes);
  if (shape === "wide") {
    if (totalNodes === 1) {
      return null;
    }
    return Object.fromEntries(
      Array.from({ length: totalNodes - 1 }, (_, index) => [
        `node-${String(index).padStart(5, "0")}`,
        index,
      ])
    );
  }

  if (totalNodes === 1) {
    return null;
  }
  const layers = Math.min(100, totalNodes - 1);
  const extras = totalNodes - 1 - layers;
  const extrasPerLayer = Math.floor(extras / layers);
  const remainder = extras % layers;
  let value: unknown = null;
  for (let layer = 0; layer < layers; layer += 1) {
    const leafCount = extrasPerLayer + (layer < remainder ? 1 : 0);
    value = Object.fromEntries([
      ["next", value],
      ...Array.from({ length: leafCount }, (_, index) => [
        `leaf-${layer}-${index}`,
        index,
      ]),
    ]);
  }
  return value;
};

export const createSyntheticSource = (
  totalNodes: 100 | 1000 | 5000,
  shape: FixtureShape = "wide"
): string =>
  `${JSON.stringify(createSyntheticProgram(totalNodes, shape), null, "\t")}\n`;

export const PERFORMANCE_FIXTURES = {
  wide100: createSyntheticSource(100, "wide"),
  wide1000: createSyntheticSource(1000, "wide"),
  wide5000: createSyntheticSource(5000, "wide"),
  deep100: createSyntheticSource(100, "deep"),
  deep1000: createSyntheticSource(1000, "deep"),
  deep5000: createSyntheticSource(5000, "deep"),
} as const;
