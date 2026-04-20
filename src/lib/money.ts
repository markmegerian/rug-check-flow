/**
 * Currency helpers that treat money as integer cents.
 *
 * Use these for all new code paths that deal with invoice totals, line items,
 * and estimates. The existing codebase still stores dollar-denominated floats
 * in the DB; those call sites can be migrated incrementally via toCents / fromCents
 * at the IO boundary.
 */

const CENTS_PER_DOLLAR = 100;

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/**
 * Convert a dollar amount (number or string) to integer cents.
 * Rounds half-up. Returns 0 for invalid input.
 */
export function toCents(dollars: number | string | null | undefined): number {
  if (dollars === null || dollars === undefined) return 0;
  const n = typeof dollars === "string" ? Number(dollars) : dollars;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * CENTS_PER_DOLLAR);
}

/**
 * Convert integer cents back to a dollar number. Does NOT round for display —
 * use formatUSD for display. Inverse of toCents for well-formed integer input.
 */
export function fromCents(cents: number | null | undefined): number {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return 0;
  return Math.trunc(cents) / CENTS_PER_DOLLAR;
}

/**
 * Sum a list of cent amounts. Non-finite values are treated as 0.
 */
export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) {
    if (Number.isFinite(v)) total += Math.trunc(v);
  }
  return total;
}

/**
 * Multiply a cent amount by an integer count. Guards against float drift by
 * forcing integer math.
 */
export function multiplyCents(cents: number, count: number): number {
  if (!Number.isFinite(cents) || !Number.isFinite(count)) return 0;
  return Math.trunc(cents) * Math.trunc(count);
}

/**
 * Apply a percentage (e.g. 8.875 tax rate) to a cent amount with half-up rounding.
 */
export function percentOfCents(cents: number, percent: number): number {
  if (!Number.isFinite(cents) || !Number.isFinite(percent)) return 0;
  return Math.round((Math.trunc(cents) * percent) / 100);
}

/**
 * Format integer cents as a USD string — e.g. 1097 -> "$10.97".
 */
export function formatUSD(cents: number | null | undefined): string {
  return USD.format(fromCents(cents));
}

/**
 * Format a dollar-denominated float for display. Prefer formatUSD (cents) for
 * new code — this exists for legacy call sites that still hand us floats.
 */
export function formatUSDFromDollars(dollars: number | string | null | undefined): string {
  return formatUSD(toCents(dollars));
}
