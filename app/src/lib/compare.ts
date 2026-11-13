import { analyze, perDay, VERDICT_RANK } from './engine'
import type { Analysis, Dataset, Mission, Site } from './types'

export interface CompareRow {
  site: Site
  a: Analysis
  /** Same mission landing `slipDays` later, or null when the Slip Test is off. */
  slipped: Analysis | null
}

/** Every site analysed for the same mission, best verdict first, then by coverage. */
export function compareSites(ds: Dataset, mission: Mission): CompareRow[] {
  const slipIdx = mission.startIdx + mission.slipDays * perDay(ds)
  return ds.sites
    .map((site) => ({
      site,
      a: analyze(ds, site, mission.startIdx, mission),
      slipped: mission.slipDays > 0 ? analyze(ds, site, slipIdx, mission) : null,
    }))
    .sort((x, y) => VERDICT_RANK[x.a.verdict] - VERDICT_RANK[y.a.verdict] || y.a.coveragePct - x.a.coveragePct)
}
