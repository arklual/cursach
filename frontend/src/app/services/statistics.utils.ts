export function normalCDF(x: number): number {
  return (1 + erf(x / Math.SQRT2)) / 2;
}

export function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

export function calcPValue(variantA: { pHat: number; reached: number }, variantB: { pHat: number; reached: number }): number {
  const delta = variantB.pHat - variantA.pHat;
  const pooled = (variantA.pHat * (1 - variantA.pHat)) / Math.max(1, variantA.reached) +
                 (variantB.pHat * (1 - variantB.pHat)) / Math.max(1, variantB.reached);
  const z = pooled ? delta / Math.sqrt(pooled) : 0;
  return pooled ? 2 * (1 - normalCDF(Math.abs(z))) : 1;
}

export function calcSampleSize(p: number, d: number, power: number): number {
  const zAlpha = 1.96;
  const zBeta = power === 0.8 ? 0.84 : 1.28;
  return Math.ceil(((zAlpha + zBeta) ** 2 * p * (1 - p)) / (d ** 2));
}
