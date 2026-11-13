import { analyze, dateToIdx, perDay } from './engine'
import type { Dataset, PlanState, SunMode, Verdict } from './types'

export interface Preset {
  id: string
  title: string
  /** One line for the menu. */
  blurb: string
  /** 1–2 sentences for the banner. */
  explain: string
  siteId: string
  /** Landing time, UTC ISO. Must sit inside the data range. */
  landing: string
  days: number
  needComms: boolean
  slipDays: number
  sunMode: SunMode
  /** What the data shows for this preset; checked in dev so the text never drifts from the data. */
  expect: { siteId: string; verdict: Verdict; slipped?: boolean }[]
}

/*
 * How the dates were chosen (all from app/public/data/sites.json, centre-of-Sun rule):
 * - Chang'e-7 delay: scanned Near Shackleton for 10-day comms missions that are GO on time and
 *   change verdict for slips of 3–7 days. 14 Dec 2026: GO on time, still GO at +3 d,
 *   RISKY from +4 d, NO-GO at +7 d.
 * - Haworth: first date in the data where Malapert is GO and Haworth NO-GO for the same
 *   10-day, Sun-only mission: 15 Nov 2026 (Malapert 100%, Haworth 26%, 150 h blackout).
 * - Best comms: bestLanding() for Malapert, 14 days, comms required: 13 Nov 2026, 100%,
 *   Earth above the skyline the whole time.
 * - Pole vs equator: 27 Nov 2026, Malapert GO 100% vs Apollo 11 NO-GO 29% (lunar night).
 * - Athena: IM-2 landed 6 Mar 2025, before our data. The Moon's polar lighting season repeats
 *   every ~346.6 days (the eclipse year: the Sun's latitude on the Moon swings ±1.5°), so the
 *   same point in the season falls ~28 Jan 2027 (two cycles later). We land at the first
 *   Mons Mouton sunrise after that: 12 Feb 2027 22:00 UTC, in a lunation where the Sun peaks
 *   at ~5° above the flat horizon there. A similar lighting period, not a replay.
 */
export const PRESETS: Preset[] = [
  {
    id: 'change7-delay',
    title: "Chang'e-7 delay",
    blurb: 'A good Shackleton landing, then the launch slips',
    explain: "Near Shackleton is GO for a 10-day landing on 14 Dec 2026. Slip 3 days and it's still GO, 4 days makes it RISKY, and the 7-day slip set here is NO-GO as the site heads into shadow. Drag the Slip Test slider to watch it change. (The delay is hypothetical.)",
    siteId: 'shackleton-ce7',
    landing: '2026-12-14T00:00:00Z',
    days: 10,
    needComms: true,
    slipDays: 7,
    sunMode: 'centre',
    expect: [
      { siteId: 'shackleton-ce7', verdict: 'GO' },
      { siteId: 'shackleton-ce7', verdict: 'NO-GO', slipped: true },
    ],
  },
  {
    id: 'haworth-hard',
    title: 'Why Haworth is hard',
    blurb: 'Haworth vs Malapert on the same dates',
    explain: 'Same 10-day mission, same landing day: Malapert is GO with sunlight the whole time, while Haworth is NO-GO because the terrain around it hides the Sun for days. Compare the two in the All sites table.',
    siteId: 'haworth',
    landing: '2026-11-15T00:00:00Z',
    days: 10,
    needComms: false,
    slipDays: 0,
    sunMode: 'centre',
    expect: [
      { siteId: 'haworth', verdict: 'NO-GO' },
      { siteId: 'malapert', verdict: 'GO' },
    ],
  },
  {
    id: 'best-comms',
    title: 'Best comms site',
    blurb: 'Malapert with direct-to-Earth comms required',
    explain: 'Malapert Massif faces Earth: on this 14-day mission Earth never drops below its skyline, so it stays GO even when comms are required. Other polar sites lose Earth for part of the same mission.',
    siteId: 'malapert',
    landing: '2026-11-13T00:00:00Z',
    days: 14,
    needComms: true,
    slipDays: 0,
    sunMode: 'centre',
    expect: [{ siteId: 'malapert', verdict: 'GO' }],
  },
  {
    id: 'pole-equator',
    title: 'Pole vs equator',
    blurb: 'Apollo 11 vs Malapert',
    explain: 'Near the equator a lunar day is about two weeks of sunlight followed by two weeks of night, so this Apollo 11 landing runs into the night and is NO-GO. At Malapert, near the pole, the Sun circles low along the horizon and the same mission is GO.',
    siteId: 'apollo-11',
    landing: '2026-11-27T00:00:00Z',
    days: 10,
    needComms: true,
    slipDays: 0,
    sunMode: 'centre',
    expect: [
      { siteId: 'apollo-11', verdict: 'NO-GO' },
      { siteId: 'malapert', verdict: 'GO' },
    ],
  },
  {
    id: 'athena-like',
    title: 'Athena at Mons Mouton',
    blurb: 'A similar low-Sun period (not the real 2025 date)',
    explain: "Athena (IM-2) landed near Mons Mouton on 6 Mar 2025, before our data starts, so we can't replay it. This lands at Mons Mouton at local sunrise on 12 Feb 2027, at about the same point in the Moon's ~347-day lighting season, when the Sun peaks only about 5° above the flat horizon. It's a similar lighting period, not the actual 2025 date.",
    siteId: 'mons-mouton',
    landing: '2027-02-12T22:00:00Z',
    days: 10,
    needComms: true,
    slipDays: 0,
    sunMode: 'centre',
    expect: [{ siteId: 'mons-mouton', verdict: 'GO' }],
  },
]

/** The preset as app state, or null if its date (plus mission and slip) isn't inside the data. */
export function resolvePreset(ds: Dataset, p: Preset): PlanState | null {
  if (!ds.sites.some((s) => s.id === p.siteId)) return null
  const startIdx = dateToIdx(ds, new Date(p.landing))
  const end = startIdx + (p.days * 24) / ds.meta.stepHours + p.slipDays * perDay(ds)
  if (startIdx < 0 || end > ds.meta.count) return null
  return { siteId: p.siteId, startIdx, durationH: p.days * 24, needComms: p.needComms, slipDays: p.slipDays, sunMode: p.sunMode }
}

/** Mismatches between a preset's expectations and the data (pass a dataset already in the preset's Sun mode). */
export function checkPreset(ds: Dataset, p: Preset): string[] {
  const st = resolvePreset(ds, p)
  if (!st) return [`${p.id}: date outside the data range`]
  const out: string[] = []
  for (const e of p.expect) {
    const site = ds.sites.find((s) => s.id === e.siteId)
    if (!site) { out.push(`${p.id}: no site ${e.siteId}`); continue }
    const start = st.startIdx + (e.slipped ? st.slipDays * perDay(ds) : 0)
    const v = analyze(ds, site, start, { ...st, startIdx: start }).verdict
    if (v !== e.verdict) out.push(`${p.id}: expected ${e.siteId}${e.slipped ? ' (slipped)' : ''} ${e.verdict}, data says ${v}`)
  }
  return out
}
