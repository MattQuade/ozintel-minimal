/**
 * Hospitality Industry (General) Award [MA000009] — penalty / OT multipliers.
 * NSW uses the national modern award. Verify against Fair Work before relying
 * for legal compliance; rates can change each 1 July.
 *
 * Weekend % for casuals already include the 25% casual loading (do not stack).
 */

export type HospitalityEmploymentKind = "casual" | "permanent";

export function hospitalityEmploymentKind(
  status: string | undefined
): HospitalityEmploymentKind {
  return String(status || "").toLowerCase() === "casual"
    ? "casual"
    : "permanent";
}

/** Saturday / Sunday ordinary-time penalty multipliers of the base hourly rate. */
export function hospitalityWeekendMultipliers(kind: HospitalityEmploymentKind): {
  saturday: number;
  sunday: number;
} {
  if (kind === "casual") {
    return { saturday: 1.5, sunday: 1.75 };
  }
  // Full-time / part-time
  return { saturday: 1.25, sunday: 1.5 };
}

/**
 * Monday–Friday overtime under MA000009 (common FT/PT rule):
 * first 2 hours @ 150%, thereafter @ 200% of base rate.
 * Casual OT rules differ — treat as same structure for MVP entry, review if needed.
 */
export function hospitalityOvertimeAmount(
  baseHourlyRate: number,
  overtimeHours: number
): number {
  const rate = Number(baseHourlyRate) || 0;
  const hours = Math.max(0, Number(overtimeHours) || 0);
  const first = Math.min(hours, 2);
  const rest = Math.max(0, hours - first);
  return Math.round((first * rate * 1.5 + rest * rate * 2) * 100) / 100;
}

export function hospitalityWeekendEarnings(
  baseHourlyRate: number,
  hours: number,
  multiplier: number
): number {
  const rate = Number(baseHourlyRate) || 0;
  const h = Math.max(0, Number(hours) || 0);
  return Math.round(rate * h * multiplier * 100) / 100;
}
