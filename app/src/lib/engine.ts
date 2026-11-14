import type { Analysis, Dataset, Mission, Rules, Site, Verdict } from './types'

export const HOUR = 3600_000

export function idxToDate(ds: Dataset, i: number): Date {
  return new Date(Date.parse(ds.meta.start) + i * ds.meta.stepHours * HOUR)
}

export function dateToIdx(ds: Dataset, d: Date): number {
  return Math.round((d.getTime() - Date.parse(ds.meta.start)) / (ds.meta.stepHours * HOUR))
}

export const clampIdx = (ds: Dataset, i: number) => Math.max(0, Math.min(ds.meta.count - 1, i))

/** Earth flags used for comms: the usable-link series when rules were applied, else line of sight. */
export const linkFlags = (site: Site): number[] => site.series.earthLink ?? site.series.earthVis

/** 1 when the mission's power (and, if required, comms) need is met at sample i. */
export function requiredAt(site: Site, i: number, needComms: boolean): number {
  const s = site.series
  return needComms ? s.sunVis[i] & linkFlags(site)[i] : s.sunVis[i]
}

export function analyze(ds: Dataset, site: Site, startIdx: number, mission: Mission): Analysis {
  const step = ds.meta.stepHours
  const n = Math.max(1, Math.round(mission.durationH / step))
  const s0 = clampIdx(ds, startIdx)
  const s1 = Math.min(ds.meta.count, s0 + n)
  const { sunVis, earthVis, sunFrac, earthLow } = site.series
  const link = linkFlags(site)
  let sun = 0, earth = 0, both = 0, req = 0, gap = 0, longest = 0, disc = 0, partial = 0, linked = 0, low = 0
  for (let i = s0; i < s1; i++) {
    sun += sunVis[i]
    earth += earthVis[i]
    linked += link[i]
    low += earthLow ? earthLow[i] : 0
    both += sunVis[i] & link[i]
    const f = sunFrac ? sunFrac[i] : sunVis[i]
    disc += f
    if (f > 0.001 && f < 0.999) partial++
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
    sunDiscPct: (100 * disc) / len,
    sunPartialPct: (100 * partial) / len,
    earthLinkPct: (100 * linked) / len,
    earthMarginalPct: (100 * low) / len,
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
  const { sunVis } = site.series
  const link = linkFlags(site)
  let req = 0, both = 0, gap = 0, longest = 0
  for (let i = s0; i < s1; i++) {
    const b = sunVis[i] & link[i]
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

/** Like fmtDate but with the year, for lists that span the whole data range. */
export function fmtDateYear(d: Date): string {
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC'
}

export function fmtDay(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/**
 * Gnomon's screening thresholds. They are the team's own planning defaults, not NASA criteria:
 * GO when the need is met at least 75% of the mission with no gap over 24 h (about one Earth day,
 * which small landers have survived on battery), RISKY at 45% / 96 h (roughly half the mission
 * covered, gaps up to four days), otherwise NO-GO. For a real decision use the power check
 * (simulateBattery), which works from the lander's own battery, load and array.
 */
export const SCREEN = { goCoverage: 75, goGapH: 24, riskyCoverage: 45, riskyGapH: 96 } as const

export function verdictFor(coveragePct: number, longestBlackoutH: number): Verdict {
  if (coveragePct >= SCREEN.goCoverage && longestBlackoutH <= SCREEN.goGapH) return 'GO'
  if (coveragePct >= SCREEN.riskyCoverage && longestBlackoutH <= SCREEN.riskyGapH) return 'RISKY'
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
  const link = linkFlags(site)
  return site.series.sunVis.map((v, i) => v & link[i])
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

/** Skyline elevation at an azimuth, linearly interpolated between the 1° bins. */
export function skyAt(skyline: number[], az: number): number {
  const a = ((az % 360) + 360) % 360
  const i = Math.floor(a)
  const f = a - i
  return skyline[i % 360] * (1 - f) + skyline[(i + 1) % 360] * f
}

/** Fraction of a disc of radius r (deg) whose centre is h degrees above a straight skyline. */
export function discFraction(h: number, r: number): number {
  const x = Math.max(-1, Math.min(1, h / r))
  return 1 - (Math.acos(x) - x * Math.sqrt(1 - x * x)) / Math.PI
}

/**
 * Default: Earth counts as soon as its centre clears the ridge (line of sight), as before. Contact
 * under MARGINAL_DEG is still flagged as marginal; raise earthMaskDeg to make the verdict require it.
 */
export const DEFAULT_RULES: Rules = { sunMode: 'centre', earthMaskDeg: 0 }
/** Earth lower than this over the ridge is flagged as marginal when no stricter mask is set. */
export const MARGINAL_DEG = 2
export const marginalDeg = (rules: Rules) => (rules.earthMaskDeg > 0 ? rules.earthMaskDeg : MARGINAL_DEG)

/**
 * Apply the visibility rules to the raw pipeline data:
 * - sunFrac: share of the Sun's disc above the skyline (partial Sun), for every sample;
 * - sunVis: the chosen Sun rule (centre or top edge);
 * - earthLink: Earth in view and at least `earthMaskDeg` above the skyline (usable link);
 * - earthLow: Earth in view but under marginalDeg: the antenna looks along the ground (terrain
 *   blockage, multipath), so that contact is flagged as marginal.
 * earthVis (line of sight) is left as the pipeline wrote it.
 */
export function withRules(ds: Dataset, rules: Rules): Dataset {
  const r = SUN_RADIUS_DEG
  return {
    ...ds,
    sites: ds.sites.map((site) => {
      const { sunAz, sunEl, earthAz, earthEl, earthVis } = site.series
      const sky = site.skyline
      const sunFrac = sunEl.map((el, i) => discFraction(el - skyAt(sky, sunAz[i]), r))
      const sunVis = rules.sunMode === 'centre'
        ? site.series.sunVis // the pipeline already computed the centre rule
        : sunEl.map((el, i) => (el + r > sky[((Math.round(sunAz[i]) % 360) + 360) % 360] ? 1 : 0))
      const clear = earthEl.map((el, i) => el - skyAt(sky, earthAz[i]))
      const earthLink = rules.earthMaskDeg > 0 ? earthVis.map((v, i) => (v && clear[i] >= rules.earthMaskDeg ? 1 : 0)) : earthVis
      const low = marginalDeg(rules)
      const earthLow = earthVis.map((v, i) => (v && clear[i] < low ? 1 : 0))
      return { ...site, series: { ...site.series, sunVis, sunFrac, earthLink, earthLow } }
    }),
  }
}

/** Index of the current time in the dataset, or null when today is outside the data range. */
export function nowIdx(ds: Dataset): number | null {
  const i = dateToIdx(ds, new Date())
  return i >= 0 && i < ds.meta.count ? i : null
}

/* ---------- power check (C1): battery state of charge over the mission ---------- */

export interface Lander {
  /** Usable battery energy, Wh. */
  batteryWh: number
  /** Average power draw (avionics, heaters, radio), W. */
  loadW: number
  /** Array output with the whole Sun disc in view, W (array assumed to face the Sun). */
  arrayW: number
  /** Lowest allowed charge, % of the battery. */
  reservePct: number
}

/** Illustrative small lander, not a real vehicle. Users should enter their own numbers. */
export const EXAMPLE_LANDER: Lander = { batteryWh: 2500, loadW: 120, arrayW: 400, reservePct: 20 }

export interface PowerResult {
  /** Charge (% of battery) at each sample of the mission, starting full. */
  soc: number[]
  minPct: number
  minIdx: number
  /** First sample where the charge fell below the reserve, or null. */
  belowReserveIdx: number | null
  /** True if the battery ran flat at some point. */
  flat: boolean
  verdict: Verdict
  /** Average energy balance over the mission, W (positive = charging). */
  netW: number
}

/**
 * Step the battery through the mission: each sample adds array output × visible Sun-disc fraction
 * and subtracts the load, over one time step. Starts full; can't charge above full.
 * GO = never below the reserve; RISKY = dips below the reserve but never flat; NO-GO = runs flat.
 */
export function simulateBattery(ds: Dataset, site: Site, startIdx: number, durationH: number, lander: Lander): PowerResult {
  const step = ds.meta.stepHours
  const n = Math.max(1, Math.round(durationH / step))
  const s0 = clampIdx(ds, startIdx)
  const s1 = Math.min(ds.meta.count, s0 + n)
  const frac = site.series.sunFrac ?? site.series.sunVis
  const cap = Math.max(1, lander.batteryWh)
  let e = cap, min = cap, minIdx = s0, below: number | null = null, flat = false, net = 0
  const soc: number[] = []
  for (let i = s0; i < s1; i++) {
    const w = lander.arrayW * frac[i] - lander.loadW
    net += w
    e = Math.min(cap, e + w * step)
    if (e <= 0) { e = 0; flat = true }
    if (e < min) { min = e; minIdx = i }
    if (below === null && (100 * e) / cap < lander.reservePct) below = i
    soc.push((100 * e) / cap)
  }
  const minPct = (100 * min) / cap
  const verdict: Verdict = flat ? 'NO-GO' : minPct < lander.reservePct ? 'RISKY' : 'GO'
  return { soc, minPct, minIdx, belowReserveIdx: below, flat, verdict, netW: net / Math.max(1, s1 - s0) }
}
