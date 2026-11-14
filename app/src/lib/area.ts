import { clampIdx, linkFlags, skyAt, SUN_RADIUS_DEG, verdictFor, VERDICT_RANK } from './engine'
import { loadTerrainMeta, type TerrainMeta } from './siteTerrain'
import type { Dataset, Mission, Rules, Site, Verdict } from './types'

/**
 * Landing-area verdict (review item C3): the same screening rules as the headline verdict, run at
 * every 100 m grid point within a radius of the landing point, each with its own full skyline
 * (pipeline/build_area_skylines.py → /data/terrain/<id>.area.bin). The landing point itself uses
 * the site's official skyline so it matches the headline verdict exactly.
 */
export interface AreaData {
  meta: TerrainMeta
  n: number
  spacing: number
  /** (n·n) × 360 skyline, deg. */
  sky: Float32Array
}

export interface PointResult {
  east: number
  north: number
  verdict: Verdict
  coveragePct: number
  sunPct: number
  longestBlackoutH: number
}

export interface AreaResult {
  radiusM: number
  points: PointResult[]
  share: Record<Verdict, number>
  worst: Verdict
  sunRange: [number, number]
  /** 10th to 90th percentile of sunlight across the area. */
  sunMid: [number, number]
  coverageRange: [number, number]
}

const cache = new Map<string, Promise<AreaData | null>>()

export function loadArea(id: string): Promise<AreaData | null> {
  let p = cache.get(id)
  if (!p) {
    p = loadTerrainMeta(id).then(async (meta) => {
      if (!meta?.available || !meta.exposure) return null
      const r = await fetch(`/data/terrain/${id}.area.bin`)
      if (!r.ok) return null
      const u8 = new Uint8Array(await r.arrayBuffer())
      const sky = new Float32Array(u8.length)
      for (let i = 0; i < u8.length; i++) sky[i] = u8[i] / 10 - 5
      return { meta, n: meta.exposure.n, spacing: meta.exposure.spacing_m, sky }
    }).catch(() => { cache.delete(id); return null })
    cache.set(id, p)
  }
  return p
}

const pctl = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]

export function analyzeArea(ds: Dataset, site: Site, area: AreaData, mission: Mission, rules: Rules, radiusM: number): AreaResult {
  const step = ds.meta.stepHours
  const len = Math.max(1, Math.round(mission.durationH / step))
  const s0 = clampIdx(ds, mission.startIdx)
  const s1 = Math.min(ds.meta.count, s0 + len)
  const { sunAz, sunEl, earthAz, earthEl } = site.series
  const { n, spacing, sky } = area
  const mid = (n - 1) / 2
  const sunOffset = rules.sunMode === 'firstLight' ? SUN_RADIUS_DEG : 0
  const mask = Math.max(0, rules.earthMaskDeg)
  const points: PointResult[] = []
  const line = new Array<number>(360)

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const east = (c - mid) * spacing
      const north = (mid - r) * spacing
      if (east * east + north * north > radiusM * radiusM + 1) continue
      const centre = r === mid && c === mid
      const k = r * n + c
      for (let a = 0; a < 360; a++) line[a] = sky[k * 360 + a]
      // The landing point uses the site's own series, so it matches the headline verdict exactly.
      const officialLink = linkFlags(site)
      let req = 0, sun = 0, gap = 0, longest = 0
      for (let i = s0; i < s1; i++) {
        let sunUp: number, link: number
        if (centre) {
          sunUp = site.series.sunVis[i]
          link = officialLink[i]
        } else {
          sunUp = sunEl[i] + sunOffset > skyAt(line, sunAz[i]) ? 1 : 0
          const clear = earthEl[i] - skyAt(line, earthAz[i])
          link = mask > 0 ? (clear >= mask ? 1 : 0) : (clear > 0 ? 1 : 0)
        }
        const ok = mission.needComms ? sunUp & link : sunUp
        sun += sunUp
        req += ok
        gap = ok ? 0 : gap + step
        if (gap > longest) longest = gap
      }
      const cnt = Math.max(1, s1 - s0)
      const coveragePct = (100 * req) / cnt
      points.push({ east, north, verdict: verdictFor(coveragePct, longest), coveragePct, sunPct: (100 * sun) / cnt, longestBlackoutH: longest })
    }
  }
  const share: Record<Verdict, number> = { GO: 0, RISKY: 0, 'NO-GO': 0 }
  for (const p of points) share[p.verdict] += 100 / points.length
  const worst = points.reduce<Verdict>((w, p) => (VERDICT_RANK[p.verdict] > VERDICT_RANK[w] ? p.verdict : w), 'GO')
  const suns = points.map((p) => p.sunPct).sort((a, b) => a - b)
  const covs = points.map((p) => p.coveragePct).sort((a, b) => a - b)
  return {
    radiusM, points, share, worst,
    sunRange: [suns[0], suns.at(-1)!], sunMid: [pctl(suns, 0.1), pctl(suns, 0.9)],
    coverageRange: [covs[0], covs.at(-1)!],
  }
}
