import { compareSites } from './compare'
import { analyze, fmtDate, fmtHours, idxToDate, perDay, VERDICT_RANK } from './engine'
import type { Analysis, Dataset, Mission, Site, Verdict } from './types'

/**
 * Mission advice: plain-language notes built only from numbers Rocky has already computed
 * (visibility series, verdict rules, the Slip Test, other dates and sites). No AI, no guessing:
 * every sentence can be traced to a value on screen.
 */

export type Tone = 'good' | 'warn' | 'bad' | 'info'

export interface AdviceAction {
  label: string
  /** Move the landing to this sample index. */
  landing?: number
  /** Switch to this site. */
  siteId?: string
}

export interface Advice {
  key: string
  tone: Tone
  text: string
  action?: AdviceAction
}

/** Longest run of 0s in flags[s0, s1): its start index and length in hours (0 when none). */
function longestGap(flags: number[], s0: number, s1: number, stepH: number) {
  let best = { from: s0, hours: 0 }
  let start = -1
  for (let i = s0; i <= s1; i++) {
    const off = i < s1 && !flags[i]
    if (off && start < 0) start = i
    if (!off && start >= 0) {
      const h = (i - start) * stepH
      if (h > best.hours) best = { from: start, hours: h }
      start = -1
    }
  }
  return best
}

const better = (x: Analysis, y: Analysis) =>
  VERDICT_RANK[x.verdict] - VERDICT_RANK[y.verdict] || y.coveragePct - x.coveragePct || x.longestBlackoutH - y.longestBlackoutH

const verdictWord: Record<Verdict, string> = { GO: 'GO', RISKY: 'RISKY', 'NO-GO': 'NO-GO' }

export function missionAdvice(ds: Dataset, site: Site, mission: Mission, a: Analysis, slipped: Analysis | null): Advice[] {
  const out: Advice[] = []
  const step = ds.meta.stepHours
  const { sunVis, earthVis } = site.series
  const when = (i: number) => fmtDate(idxToDate(ds, i))
  const from = (i: number) => (i === a.startIdx ? `right from touchdown (${when(i)})` : `from ${when(i)}`)
  const missionH = (a.endIdx - a.startIdx) * step

  // 1. Power and cold: the longest stretch without sunlight.
  const sunGap = longestGap(sunVis, a.startIdx, a.endIdx, step)
  if (sunGap.hours === 0) {
    out.push({ key: 'sun', tone: 'good', text: 'The Sun stays up for the whole mission, so solar power never drops out.' })
  } else if (sunGap.hours >= missionH) {
    out.push({ key: 'sun', tone: 'bad', text: `The Sun never clears the skyline during this mission: no solar power at all, and ground in shadow stays far below freezing (around −170 °C or colder).` })
  } else {
    out.push({
      key: 'sun',
      tone: sunGap.hours > 96 ? 'bad' : sunGap.hours > 24 ? 'warn' : 'info',
      text: `Longest stretch without sunlight: ${fmtHours(sunGap.hours)}, ${from(sunGap.from)}. No solar power then, and ground in shadow gets far below freezing (around −170 °C or colder), so batteries and heaters must last that long.`,
    })
  }

  // 2. Direct contact with Earth.
  const earthGap = longestGap(earthVis, a.startIdx, a.endIdx, step)
  if (a.earthPct === 0) {
    out.push({ key: 'earth', tone: mission.needComms ? 'bad' : 'warn', text: 'Earth never rises above the skyline here, so there is no direct contact at all. Every message has to go through a relay satellite.' })
  } else if (earthGap.hours === 0) {
    out.push({ key: 'earth', tone: 'good', text: 'Earth stays in view for the whole mission, so direct contact is always possible.' })
  } else {
    out.push({
      key: 'earth',
      tone: mission.needComms ? (earthGap.hours > 96 ? 'bad' : earthGap.hours > 24 ? 'warn' : 'info') : 'info',
      text: `Longest stretch without Earth in view: ${fmtHours(earthGap.hours)}, ${from(earthGap.from)}. Plan stored commands or a relay satellite for that time.`,
    })
  }

  // 3. Slip Test.
  if (slipped && mission.slipDays > 0) {
    const d = VERDICT_RANK[slipped.verdict] - VERDICT_RANK[a.verdict]
    const n = `${mission.slipDays} day${mission.slipDays > 1 ? 's' : ''}`
    const nAdj = `${mission.slipDays}-day`
    if (d > 0) {
      out.push({ key: 'slip', tone: 'warn', text: `If the landing slips ${n}, the verdict drops to ${verdictWord[slipped.verdict]} (coverage ${Math.round(slipped.coveragePct)}%). Keep a backup date.` })
    } else if (d < 0) {
      out.push({ key: 'slip', tone: 'info', text: `A ${nAdj} slip would actually improve this to ${verdictWord[slipped.verdict]} (coverage ${Math.round(slipped.coveragePct)}%): the current date is not the best one.` })
    } else if (a.verdict !== 'NO-GO') {
      out.push({ key: 'slip', tone: 'good', text: `A ${nAdj} slip keeps the verdict at ${verdictWord[a.verdict]}, so this date has some margin.` })
    }
  }

  // 4. A better landing within a week either side (same site, same mission).
  const pd = perDay(ds)
  const step6h = Math.max(1, Math.round(6 / step))
  let best: Analysis | null = null
  for (let i = Math.max(0, a.startIdx - 7 * pd); i <= Math.min(ds.meta.count - 1, a.startIdx + 7 * pd); i += step6h) {
    if (i === a.startIdx) continue
    const x = analyze(ds, site, i, mission)
    if (x.endIdx - x.startIdx < a.endIdx - a.startIdx) continue // runs off the end of the data
    if (!best || better(x, best) < 0) best = x
  }
  if (best && (VERDICT_RANK[best.verdict] < VERDICT_RANK[a.verdict] || best.coveragePct >= a.coveragePct + 10)) {
    const days = (best.startIdx - a.startIdx) / pd
    const rel = `${Math.abs(days) < 1 ? fmtHours(Math.abs(days) * 24) : `${Math.round(Math.abs(days) * 10) / 10} days`} ${days < 0 ? 'earlier' : 'later'}`
    const sameVerdict = best.verdict === a.verdict
    out.push({
      key: 'date',
      tone: 'info',
      text: sameVerdict
        ? `Landing ${when(best.startIdx)} (${rel}) is still ${verdictWord[best.verdict]}, but raises coverage to ${Math.round(best.coveragePct)}% (longest blackout ${fmtHours(best.longestBlackoutH)}).`
        : `Landing ${when(best.startIdx)} (${rel}) gives ${verdictWord[best.verdict]}: coverage ${Math.round(best.coveragePct)}%, longest blackout ${fmtHours(best.longestBlackoutH)}.`,
      action: { label: 'Land then', landing: best.startIdx },
    })
  }

  // 5. A better site for the same dates.
  const rows = compareSites(ds, mission).filter((r) => r.site.id !== site.id)
  const top = rows[0]
  if (top && VERDICT_RANK[top.a.verdict] < VERDICT_RANK[a.verdict]) {
    out.push({
      key: 'site',
      tone: 'info',
      text: `For the same dates, ${top.site.name} would be ${verdictWord[top.a.verdict]} (coverage ${Math.round(top.a.coveragePct)}%, longest blackout ${fmtHours(top.a.longestBlackoutH)}).`,
      action: { label: 'Switch site', siteId: top.site.id },
    })
  }

  // 6. How much to trust the terrain.
  if (site.confidence === 'low') {
    out.push({
      key: 'conf',
      tone: 'info',
      text: site.terrain.startsWith('none')
        ? 'There is no terrain data for this site (Rocky assumes a smooth horizon), so treat these numbers as a rough guide.'
        : `Terrain here is coarse (${site.terrain}), so treat these numbers as a rough guide.`,
    })
  }

  return out
}
