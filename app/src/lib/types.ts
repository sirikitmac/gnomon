export interface Series {
  sunAz: number[]
  sunEl: number[]
  earthAz: number[]
  earthEl: number[]
  sunVis: number[]
  earthVis: number[]
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
  skyline: number[]
  series: Series
}

export interface Dataset {
  meta: { mock: boolean; start: string; stepHours: number; count: number; notes?: string; generatedBy?: string }
  sites: Site[]
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
}
