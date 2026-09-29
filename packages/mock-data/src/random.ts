/** FNV-1a 32-bit hash; stable across platforms so generated data is deterministic. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 PRNG. */
export function createRandom(seed: string): () => number {
  let state = hashString(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Multiplicative noise centred on 1 (e.g. spread 0.1 → 0.9..1.1). */
export function noise(random: () => number, spread: number): number {
  return 1 - spread + random() * spread * 2;
}

/**
 * Splits `total` into parts proportional to `weights` using the largest-remainder method,
 * so the parts always sum exactly to the total at the requested precision.
 */
export function allocate(total: number, weights: readonly number[], decimals = 0): number[] {
  const scale = 10 ** decimals;
  const units = Math.round(total * scale);
  const weightSum = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (weights.length === 0) return [];
  if (weightSum <= 0 || units === 0) return weights.map(() => 0);

  const raw = weights.map((w) => (Math.max(0, w) / weightSum) * units);
  const floors = raw.map(Math.floor);
  let remainder = units - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { index } of order) {
    if (remainder <= 0) break;
    floors[index] = (floors[index] ?? 0) + 1;
    remainder -= 1;
  }
  return floors.map((f) => f / scale);
}

export const round = (value: number, decimals: number) => Math.round(value * 10 ** decimals) / 10 ** decimals;
