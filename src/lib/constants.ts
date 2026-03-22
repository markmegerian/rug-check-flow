/** Centralized constants shared across the application. */

export const DAYS_OF_WEEK = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

/** Maps day names to JS Date.getDay() values (Sunday=0). Use with caution — DAYS_OF_WEEK starts at Monday. */
export const DAY_INDEX: Record<string, number | undefined> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};

export const ROUTE_DAYS = ["", ...DAYS_OF_WEEK] as const;

export const DEFAULT_ROUTE_DAY: DayOfWeek = "Thursday";
export const DEFAULT_REGION = "Westchester";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const PRICING_TIERS = ["standard", "preferred", "vip"] as const;
export type PricingTier = (typeof PRICING_TIERS)[number];

export const TIER_LABELS: Record<PricingTier, string> = {
  standard: "Standard",
  preferred: "Preferred",
  vip: "VIP",
};

export const TIER_COLORS: Record<PricingTier, string> = {
  standard: "bg-muted text-muted-foreground",
  preferred: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  vip: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};
