import { analyze, perDay, VERDICT_RANK } from './engine'
import type { Analysis, Dataset, Mission, Site } from './types'

export interface CompareRow {
  site: Site
  a: Analysis
  /** Same mission landing `slipDays` later, or null when the Slip Test is off. */
  slipped: Analysis | null
}

/** Sites analysed for the same mission (all of them, or just `ids`), best verdict first, then by coverage. */
export function compareSites(ds: Dataset, mission: Mission, ids?: string[]): CompareRow[] {
  const slipIdx = mission.startIdx + mission.slipDays * perDay(ds)
  return ds.sites
    .filter((site) => !ids || ids.includes(site.id))
    .map((site) => ({
      site,
      a: analyze(ds, site, mission.startIdx, mission),
      slipped: mission.slipDays > 0 ? analyze(ds, site, slipIdx, mission) : null,
    }))
    .sort((x, y) => VERDICT_RANK[x.a.verdict] - VERDICT_RANK[y.a.verdict] || y.a.coveragePct - x.a.coveragePct)
}

export const isOriginal = (s: Site) => (s.group ?? 'original') === 'original'

const KEY = 'rocky.compare'

/** Ids on the Compare page: what the viewer last picked (kept in this browser), else the original sites. */
export function loadCompareIds(ds: Dataset): string[] {
  const valid = new Set(ds.sites.map((s) => s.id))
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (Array.isArray(saved)) {
      const ids = saved.filter((id): id is string => typeof id === 'string' && valid.has(id))
      if (ids.length) return ids
    }
  } catch { /* storage unavailable or bad JSON: fall back to the defaults */ }
  return ds.sites.filter(isOriginal).map((s) => s.id)
}

export function saveCompareIds(ids: string[]) {
  try { localStorage.setItem(KEY, JSON.stringify(ids)) } catch { /* storage unavailable */ }
}
