export const CLEANING_SERVICE_MINIMUM = 35;

export function isCleaningCategory(category: string | null | undefined): boolean {
  return (category ?? "").trim().toLowerCase() === "cleaning";
}

export function applyCleaningServiceMinimum(amount: number, category: string | null | undefined): number {
  const normalized = Number(amount) || 0;
  if (!isCleaningCategory(category)) return normalized;
  return Math.max(normalized, CLEANING_SERVICE_MINIMUM);
}
