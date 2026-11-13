import type { Analysis, Dataset, Mission, Site, SunMode, Verdict } from './types'

export const HOUR = 3600_000

export function idxToDate(ds: Dataset, i: number): Date {
  return new Date(Date.parse(ds.meta.start) + i * ds.meta.stepHours * HOUR)
}

export function dateToIdx(ds: Dataset, d: Date): number {
  return Math.round((d.getTime() - Date.parse(ds.meta.start)) / (ds.meta.stepHours * HOUR))
}

export const clampIdx = (ds: Dataset, i: number) => Math.max(0, Math.min(ds.meta.count - 1, i))

/** 1 when the mission's power (and, if required, comms) need is met at sample i. */
export function requiredAt(site: Site, i: number, needComms: boolean): number {
  const s = site.series
  return needComms ? s.sunVis[i] & s.earthVis[i] : s.sunVis[i]
}

export function analyze(ds: Dataset, site: Site, startIdx: number, mission: Mission): Analysis {
  const step = ds.meta.stepHours
  const n = Math.max(1, Math.round(mission.durationH / step))
  const s0 = clampIdx(ds, startIdx)
  const s1 = Math.min(ds.meta.count, s0 + n)
  const { sunVis, earthVis } = site.series
  let sun = 0, earth = 0, both = 0, req = 0, gap = 0, longest = 0
  for (let i = s0; i < s1; i++) {
    sun += sunVis[i]
    earth += earthVis[i]
    both += sunVis[i] & earthVis[i]
    const r = requiredAt(site, i, mission.needComms)
    req += r
    gap = r ? 0 : gap + step
    longest = Math.max(longest, gap)
  }
  const len = Math.max(1, s1 - s0)
  const coveragePct = (100 * req) / len
  return {
    startIdx: s0,
    endIdx: s1,
    sunPct: (100 * sun) / len,
    earthPct: (100 * earth) / len,
    bothPct: (100 * both) / len,
    coveragePct,
    longestBlackoutH: longest,
    firstWindow: findWindow(ds, site, s0, mission.needComms),
    verdict: verdictFor(coveragePct, longest),
  }
}

export interface Score {
  coveragePct: number
  longestBlackoutH: number
  bothPct: number
  verdict: Verdict
  /** False when the mission runs past the end of the data, so the numbers cover only part of it. */
  complete: boolean
}

/**
 * The verdict numbers of `analyze` without the extras (no window search), for scanning
 * hundreds of landing dates at once. Same coverage and blackout rules as `analyze`.
 */
export function score(ds: Dataset, site: Site, startIdx: number, durationH: number, needComms: boolean): Score {
  const step = ds.meta.stepHours
  const n = Math.max(1, Math.round(durationH / step))
  const s0 = clampIdx(ds, startIdx)
  const s1 = Math.min(ds.meta.count, s0 + n)
  const { sunVis, earthVis } = site.series
  let req = 0, both = 0, gap = 0, longest = 0
  for (let i = s0; i < s1; i++) {
    const b = sunVis[i] & earthVis[i]
    const r = needComms ? b : sunVis[i]
    both += b
    req += r
    gap = r ? 0 : gap + step
    if (gap > longest) longest = gap
  }
  const len = Math.max(1, s1 - s0)
  const coveragePct = (100 * req) / len
  return { coveragePct, longestBlackoutH: longest, bothPct: (100 * both) / len, verdict: verdictFor(coveragePct, longest), complete: s0 + n <= ds.meta.count }
}

export const VERDICT_RANK: Record<Verdict, number> = { GO: 0, RISKY: 1, 'NO-GO': 2 }

/** Samples per day at this dataset's step. */
export const perDay = (ds: Dataset) => 24 / ds.meta.stepHours

export function fmtDay(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function verdictFor(coveragePct: number, longestBlackoutH: number): Verdict {
  if (coveragePct >= 75 && longestBlackoutH <= 24) return 'GO'
  if (coveragePct >= 45 && longestBlackoutH <= 96) return 'RISKY'
  return 'NO-GO'
}

/** First continuous run where the requirement holds, starting at or after `from`. */
export function findWindow(ds: Dataset, site: Site, from: number, needComms: boolean) {
  let i = from
  while (i < ds.meta.count && !requiredAt(site, i, needComms)) i++
  if (i >= ds.meta.count) return null
  let j = i
  while (j < ds.meta.count && requiredAt(site, j, needComms)) j++
  return { from: i, to: j }
}

/** Hours until a visibility flag flips, from sample i. Returns null if it never flips in range. */
export function hoursUntilChange(ds: Dataset, flags: number[], i: number): { hours: number; nowVisible: boolean } | null {
  const now = flags[i]
  for (let j = i + 1; j < ds.meta.count; j++) {
    if (flags[j] !== now) return { hours: (j - i) * ds.meta.stepHours, nowVisible: !!now }
  }
  return null
}

/** Landing time (in range) with the best coverage for this mission length. */
export function bestLanding(ds: Dataset, site: Site, mission: Mission) {
  let best = { idx: 0, coverage: -1, blackout: Infinity }
  const n = Math.round(mission.durationH / ds.meta.stepHours)
  for (let i = 0; i + n <= ds.meta.count; i += 6) {
    const a = analyze(ds, site, i, mission)
    if (a.coveragePct > best.coverage || (a.coveragePct === best.coverage && a.longestBlackoutH < best.blackout)) {
      best = { idx: i, coverage: a.coveragePct, blackout: a.longestBlackoutH }
    }
  }
  return best
}

/** Collapse a 0/1 series into [start, end) runs of 1s for cheap drawing. */
export function runs(flags: number[], from = 0, to = flags.length): [number, number][] {
  const out: [number, number][] = []
  let s = -1
  for (let i = from; i < to; i++) {
    if (flags[i] && s < 0) s = i
    if (!flags[i] && s >= 0) { out.push([s, i]); s = -1 }
  }
  if (s >= 0) out.push([s, to])
  return out
}

export function bothFlags(site: Site): number[] {
  const { sunVis, earthVis } = site.series
  return sunVis.map((v, i) => v & earthVis[i])
}

const R = Math.PI / 180

/** Sub-point (lat, lon) of a distant body, from a site's local az/el. Used to aim the 3D lights. */
export function subPoint(lat: number, lon: number, az: number, el: number): [number, number] {
  const p = lat * R, a = az * R, e = el * R
  const d = Math.asin(Math.sin(p) * Math.sin(e) + Math.cos(p) * Math.cos(e) * Math.cos(a))
  const dl = Math.atan2(Math.sin(a) * Math.cos(e) * Math.cos(p), Math.sin(e) - Math.sin(p) * Math.sin(d))
  return [d / R, lon + dl / R]
}

export function fmtDate(d: Date): string {
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC'
}

export function fmtHours(h: number): string {
  if (h < 48) return `${Math.round(h)} h`
  const d = Math.floor(h / 24)
  const r = Math.round(h - d * 24)
  return r ? `${d} d ${r} h` : `${d} d`
}

/** Sun's apparent radius in degrees, used for the "first light" (upper edge) rule. */
export const SUN_RADIUS_DEG = 0.27

/**
 * Recompute Sun visibility from the stored elevations and skyline, so the app can
 * switch between "centre above skyline" and "first light" (upper edge above skyline)
 * without rerunning the pipeline. Earth visibility is left as the pipeline wrote it.
 */
export function withSunMode(ds: Dataset, mode: SunMode): Dataset {
  if (mode === 'centre') return ds // the pipeline already computed the centre rule
  const offset = SUN_RADIUS_DEG
  return {
    ...ds,
    sites: ds.sites.map((site) => {
      const { sunAz, sunEl } = site.series
      const sunVis = sunEl.map((el, i) => (el + offset > site.skyline[((Math.round(sunAz[i]) % 360) + 360) % 360] ? 1 : 0))
      return { ...site, series: { ...site.series, sunVis } }
    }),
  }
}

/** Index of the current time in the dataset, or null when today is outside the data range. */
export function nowIdx(ds: Dataset): number | null {
  const i = dateToIdx(ds, new Date())
  return i >= 0 && i < ds.meta.count ? i : null
}
