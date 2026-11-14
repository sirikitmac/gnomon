import { dateToIdx, idxToDate } from './engine'
import type { Dataset, PlanState } from './types'

/*
 * Share-link format (all optional, invalid values are ignored):
 *   ?site=malapert&t=2026-12-14T00:00Z&days=10&comms=1&slip=0&sun=centre&earth=2
 * t is the landing time in UTC (snapped to the data step); sun is "centre" or "edge";
 * earth is the minimum Earth clearance above the skyline, whole degrees 0-5.
 */

export function encodePlan(ds: Dataset, st: PlanState): string {
  const p = new URLSearchParams()
  p.set('site', st.siteId)
  p.set('t', idxToDate(ds, st.startIdx).toISOString().slice(0, 16) + 'Z')
  p.set('days', String(Math.round(st.durationH / 24)))
  p.set('comms', st.needComms ? '1' : '0')
  p.set('slip', String(st.slipDays))
  p.set('sun', st.sunMode === 'firstLight' ? 'edge' : 'centre')
  p.set('earth', String(st.earthMaskDeg))
  return p.toString()
}

const int = (v: string | null, lo: number, hi: number): number | undefined => {
  if (v === null || !/^\d+$/.test(v)) return undefined
  const n = +v
  return n >= lo && n <= hi ? n : undefined
}

/** The parts of a plan found in a query string, validated against the dataset. */
export function decodePlan(ds: Dataset, search: string): Partial<PlanState> {
  const p = new URLSearchParams(search)
  const out: Partial<PlanState> = {}
  const site = p.get('site')
  if (site && ds.sites.some((s) => s.id === site)) out.siteId = site
  const t = p.get('t')
  if (t) {
    const ms = Date.parse(t)
    if (!Number.isNaN(ms)) {
      const i = dateToIdx(ds, new Date(ms))
      if (i >= 0 && i < ds.meta.count) out.startIdx = i
    }
  }
  const days = int(p.get('days'), 1, 28)
  if (days !== undefined) out.durationH = days * 24
  const comms = p.get('comms')
  if (comms === '1' || comms === '0') out.needComms = comms === '1'
  const slip = int(p.get('slip'), 0, 14)
  if (slip !== undefined) out.slipDays = slip
  const sun = p.get('sun')
  if (sun === 'centre' || sun === 'edge') out.sunMode = sun === 'edge' ? 'firstLight' : 'centre'
  const earth = int(p.get('earth'), 0, 5)
  if (earth !== undefined) out.earthMaskDeg = earth
  return out
}
