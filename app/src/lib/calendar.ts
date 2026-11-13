import { HOUR, idxToDate, score, type Score } from './engine'
import type { Dataset, Site } from './types'

export interface DayCell {
  /** Sample index of 00:00 UTC on this day. */
  idx: number
  /** Day of the month, 1-based. */
  day: number
  score: Score
}

export interface MonthBlock {
  key: string
  label: string
  /** Empty cells before day 1 (Sunday-first week). */
  lead: number
  /** Days of the month in order; null for days outside the data range. */
  days: (DayCell | null)[]
}

const DAY_MS = 24 * HOUR

/**
 * One cell per UTC day in the data range, each scored as a mission that lands at
 * 00:00 UTC that day. ~790 days × mission length samples: a few ms, so callers just memoize.
 */
export function calendarMonths(ds: Dataset, site: Site, durationH: number, needComms: boolean): MonthBlock[] {
  const t0 = Date.parse(ds.meta.start)
  const stepMs = ds.meta.stepHours * HOUR
  const tEnd = t0 + (ds.meta.count - 1) * stepMs
  const first = new Date(Math.ceil(t0 / DAY_MS) * DAY_MS)
  const months: MonthBlock[] = []
  const m = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1))
  while (m.getTime() <= tEnd) {
    const y = m.getUTCFullYear(), mo = m.getUTCMonth()
    const nDays = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate()
    const days: (DayCell | null)[] = []
    for (let d = 1; d <= nDays; d++) {
      const t = Date.UTC(y, mo, d)
      const off = t - t0
      // Only days whose midnight lands exactly on a sample (true for the 1 h / 2 h data we ship).
      if (t < t0 || t > tEnd || off % stepMs !== 0) { days.push(null); continue }
      const idx = off / stepMs
      days.push({ idx, day: d, score: score(ds, site, idx, durationH, needComms) })
    }
    months.push({
      key: `${y}-${mo}`,
      label: m.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      lead: m.getUTCDay(),
      days,
    })
    m.setUTCMonth(mo + 1)
  }
  return months
}

/** Index of 00:00 UTC on the day containing sample i. */
export function dayStartIdx(ds: Dataset, i: number): number {
  const d = idxToDate(ds, i)
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return Math.round((midnight - Date.parse(ds.meta.start)) / (ds.meta.stepHours * HOUR))
}
