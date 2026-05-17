import CronParser from "cron-parser"

export interface CronResult {
  nextRun: Date
  now: Date
}

function getParser(cronExpr: string) {
  return CronParser.parseExpression(cronExpr, { utc: true })
}

/**
 * Calculate the next execution date from a cron expression.
 * Returns a Date; throws if the cron expression is invalid.
 * Callers must catch the error.
 */
export function getNextRunDate(cronExpr: string): Date {
  return getParser(cronExpr).next().toDate()
}

/**
 * Pre-compute the next run timestamp (used at save time).
 * Passes the error through so the caller can surface it meaningfully.
 */
export function computeNextRunAt(cronExpr: string): Date {
  return getNextRunDate(cronExpr)
}

/**
 * Convert next-run Date to a human-readable string (client-safe: no server deps).
 */
export function formatNextRun(date: Date): string {
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffMins = Math.round(diffMs / 60000)
  if (diffMins < 1) return "Due now"
  if (diffMins < 60) return `${diffMins}m from now`
  const diffHours = diffMins / 60
  if (diffHours < 24) return `${Math.round(diffHours)}h from now`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return "Tomorrow"
  return `In ${diffDays} days`
}
