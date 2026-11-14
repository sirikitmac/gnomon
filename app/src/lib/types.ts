export interface Series {
  sunAz: number[]
  sunEl: number[]
  earthAz: number[]
  earthEl: number[]
  sunVis: number[]
  /** Earth's centre above the terrain skyline (line of sight), as the pipeline computed it. */
  earthVis: number[]
  /** Added in the app (engine.withRules): fraction of the Sun's disc above the skyline, 0..1. */
  sunFrac?: number[]
  /** Added in the app: Earth in view AND at least the chosen clearance above the skyline (usable link). */
  earthLink?: number[]
  /** Added in the app: Earth in view but low (under the mask, or under 2° when no mask is set). */
  earthLow?: number[]
}

export interface Site {
  id: string
  name: string
  lat: number
  lonEast: number
  role: string
  story: string
  source: string
  terrain: string
  confidence: string
  /** "original": one of the 6 default sites; "added": an extra site, off the Compare list until added. Missing = original. */
  group?: 'original' | 'added'
  /** Body-fixed frame of the published coordinates: 'ME' (Mean Earth, as LOLA and Horizons use) or 'unknown'. */
  frame?: string
  frameNote?: string
  skyline: number[]
  series: Series
}

export interface DataProvenance {
  version: string
  built: string
  ephemeris: string
  terrain: string
  independentChecks: string[]
}

export interface Dataset {
  meta: { mock: boolean; start: string; stepHours: number; count: number; notes?: string; generatedBy?: string; provenance?: DataProvenance }
  sites: Site[]
}

/** How visibility is counted. Applied to the raw data by engine.withRules. */
export interface Rules {
  sunMode: SunMode
  /** Earth must be at least this many degrees above the terrain skyline for a usable link. */
  earthMaskDeg: number
}

export type SunMode = 'centre' | 'firstLight'

export interface Mission {
  startIdx: number
  durationH: number
  needComms: boolean
  slipDays: number
}

/** Everything that defines a plan: what presets set and what the share link encodes. */
export interface PlanState {
  siteId: string
  startIdx: number
  durationH: number
  needComms: boolean
  slipDays: number
  sunMode: SunMode
  earthMaskDeg: number
}

export type Verdict ='GO' | 'RISKY' | 'NO-GO'

export interface Analysis {
  startIdx: number
  endIdx: number
  sunPct: number
  earthPct: number
  bothPct: number
  coveragePct: number
  longestBlackoutH: number
  firstWindow: { from: number; to: number } | null
  verdict: Verdict
  /** Average share of the Sun's disc in view over the mission, 0..100 (partial Sun counted). */
  sunDiscPct: number
  /** Share of the mission with the Sun only partly above the skyline. */
  sunPartialPct: number
  /** Earth in view and above the clearance mask (usable link). */
  earthLinkPct: number
  /** Earth in view but low over the ridge (marginal link), see MARGINAL_DEG. */
  earthMarginalPct: number
}
