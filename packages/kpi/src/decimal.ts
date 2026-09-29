import Decimal from 'decimal.js';

/** Isolated Decimal constructor so global Decimal settings elsewhere cannot change KPI precision. */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type DecimalValue = InstanceType<typeof D>;

export type Numeric = string | number | DecimalValue | { toString(): string } | null | undefined;

export function toDecimal(value: Numeric): DecimalValue | null {
  if (value === null || value === undefined) return null;
  if (value instanceof D) return value;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? new D(value) : null;
  }
  const text = value.toString().trim();
  if (text === '') return null;
  try {
    const parsed = new D(text);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

export function toDecimalOrZero(value: Numeric): DecimalValue {
  return toDecimal(value) ?? new D(0);
}

/** Returns null when the denominator is zero/missing, never Infinity or NaN. */
export function safeDivide(numerator: Numeric, denominator: Numeric): DecimalValue | null {
  const n = toDecimal(numerator);
  const d = toDecimal(denominator);
  if (n === null || d === null || d.isZero()) return null;
  return n.div(d);
}

export function toNumber(value: DecimalValue | null): number | null {
  return value === null ? null : value.toNumber();
}

export function roundTo(value: Numeric, decimals: number): number | null {
  const d = toDecimal(value);
  return d === null ? null : d.toDecimalPlaces(decimals, D.ROUND_HALF_UP).toNumber();
}
