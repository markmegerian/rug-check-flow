/** Strip all non-numeric characters from a string. */
export function numericOnly(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

/** Format a number as USD currency string. */
export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** Capitalize the first letter of a string. */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Pluralize a word based on count. */
export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}
