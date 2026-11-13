import { perDay, score, VERDICT_RANK, type Score } from './engine'
import type { Dataset } from './types'

export interface PlanOption {
  siteId: string
  idx: number
  score: Score
}

export interface PlanOptions {
  /** First landing index to consider (e.g. today). */
  fromIdx: number
  /** Spacing between candidate landing times, in hours. */
  stepH?: number
  limit?: number
  /** Results for the same site must be at least this many days apart. */
  minGapDays?: number
  /** Among GO results, prefer the earliest date over the best numbers. */
  earliest?: boolean
}

/** Best first: verdict, then coverage, then shortest longest-blackout, then more Sun+Earth overlap, then earlier. */
export function compareOptions(a: PlanOption, b: PlanOption): number {
  return VERDICT_RANK[a.score.verdict] - VERDICT_RANK[b.score.verdict]
    || b.score.coveragePct - a.score.coveragePct
    || a.score.longestBlackoutH - b.score.longestBlackoutH
    || b.score.bothPct - a.score.bothPct
    || a.idx - b.idx
}

function compareEarliest(a: PlanOption, b: PlanOption): number {
  const ag = a.score.verdict === 'GO', bg = b.score.verdict === 'GO'
  if (ag && bg) return a.idx - b.idx
  if (ag !== bg) return ag ? -1 : 1
  return compareOptions(a, b)
}

/**
 * Search every site × landing time (every `stepH` hours) for the given mission and return
 * the top `limit` options. Missions that would run past the data are skipped. Near-identical
 * results (same site, under `minGapDays` apart) are collapsed to the better one.
 * 6 sites × ~3,200 landings × ≤336 samples: a few ms.
 */
export function planMissions(ds: Dataset, durationH: number, needComms: boolean, opts: PlanOptions): PlanOption[] {
  const { fromIdx, stepH = 6, limit = 5, minGapDays = 3, earliest = false } = opts
  const stride = Math.max(1, Math.round(stepH / ds.meta.stepHours))
  const n = Math.max(1, Math.round(durationH / ds.meta.stepHours))
  const all: PlanOption[] = []
  for (const site of ds.sites) {
    for (let i = Math.max(0, fromIdx); i + n <= ds.meta.count; i += stride) {
      all.push({ siteId: site.id, idx: i, score: score(ds, site, i, durationH, needComms) })
    }
  }
  all.sort(earliest ? compareEarliest : compareOptions)
  const gap = minGapDays * perDay(ds)
  const out: PlanOption[] = []
  for (const o of all) {
    if (out.some((p) => p.siteId === o.siteId && Math.abs(p.idx - o.idx) < gap)) continue
    out.push(o)
    if (out.length >= limit) break
  }
  return out
}
