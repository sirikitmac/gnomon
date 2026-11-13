import { useEffect, useState } from 'react'

/** Metadata written by pipeline/build_site_terrain.py (docs/data-format.md, "Site 3D data"). */
export interface TerrainMeta {
  id: string
  name: string
  available: boolean
  coarse: boolean
  reason?: string
  terrain?: {
    file: string
    size: number
    spacing_m: number
    extent_m: number
    minHeight_m: number
    maxHeight_m: number
    source: string
    resolution: string
  }
  exposure?: {
    spacing_m: number
    n: number
    extent_m: number
    skylineFile: string
    skylineMinRange_m: number
    directions: string
    sunPct: number[]
    earthPct: number[]
    bothPct: number[]
    height_m: number[]
  }
}

export interface SiteTerrain {
  meta: TerrainMeta
  /** size × size heights (m), row 0 = north, column 0 = west. */
  heights: Float32Array
  /** (n·n) × 360 distant-terrain skyline, Uint8: deg = v / 10 − 5. */
  farSky: Uint8Array
}

export type Metric = 'sun' | 'earth' | 'both'
export const METRIC_KEY = { sun: 'sunPct', earth: 'earthPct', both: 'bothPct' } as const

const metaCache = new Map<string, Promise<TerrainMeta | null>>()
const fullCache = new Map<string, Promise<SiteTerrain | null>>()

export function loadTerrainMeta(id: string): Promise<TerrainMeta | null> {
  let p = metaCache.get(id)
  if (!p) {
    p = fetch(`/data/terrain/${id}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<TerrainMeta>) : null))
      .catch(() => { metaCache.delete(id); return null })
    metaCache.set(id, p)
  }
  return p
}

export function loadTerrain(id: string): Promise<SiteTerrain | null> {
  let p = fullCache.get(id)
  if (!p) {
    p = loadTerrainMeta(id).then(async (meta) => {
      if (!meta?.available || !meta.terrain || !meta.exposure) return meta ? { meta, heights: new Float32Array(), farSky: new Uint8Array() } : null
      const [h, s] = await Promise.all([
        fetch(`/data/terrain/${meta.terrain.file}`).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer() }),
        fetch(`/data/terrain/${meta.exposure.skylineFile}`).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer() }),
      ])
      return { meta, heights: new Float32Array(h), farSky: new Uint8Array(s) }
    }).catch(() => { fullCache.delete(id); return null })
    fullCache.set(id, p)
  }
  return p
}

type Loaded<T> = { id: string; value: T | null; done: boolean }

function useLoaded<T>(id: string, load: (id: string) => Promise<T | null>): { value: T | null; loading: boolean } {
  const [st, setSt] = useState<Loaded<T>>({ id: '', value: null, done: false })
  useEffect(() => {
    let live = true
    load(id).then((value) => { if (live) setSt({ id, value, done: true }) })
    return () => { live = false }
  }, [id, load])
  return st.id === id ? { value: st.value, loading: !st.done } : { value: null, loading: true }
}

export const useTerrainMeta = (id: string) => useLoaded(id, loadTerrainMeta)
export const useTerrain = (id: string) => useLoaded(id, loadTerrain)

/** Bilinear value of an n × n grid (row 0 = north) at ground offsets (m) from the centre; NaN outside. */
export function gridAt(values: ArrayLike<number>, n: number, spacing: number, east: number, north: number): number {
  const half = (n - 1) / 2
  const c = east / spacing + half
  const r = half - north / spacing
  if (c < 0 || r < 0 || c > n - 1 || r > n - 1) return NaN
  const c0 = Math.min(n - 2, Math.floor(c)), r0 = Math.min(n - 2, Math.floor(r))
  const fc = c - c0, fr = r - r0
  const v = (i: number, j: number) => values[(r0 + i) * n + c0 + j]
  return v(0, 0) * (1 - fr) * (1 - fc) + v(0, 1) * (1 - fr) * fc + v(1, 0) * fr * (1 - fc) + v(1, 1) * fr * fc
}

/** Min and max of a grid within radius_m of the centre (grid points only). */
export function rangeWithin(values: number[], n: number, spacing: number, radius: number): [number, number] {
  const half = (n - 1) / 2
  let lo = Infinity, hi = -Infinity
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (Math.hypot((c - half) * spacing, (r - half) * spacing) > radius + 1e-6) continue
    const v = values[r * n + c]
    lo = Math.min(lo, v); hi = Math.max(hi, v)
  }
  return [lo, hi]
}

/** Area (km²) where the bilinearly interpolated grid is ≥ threshold, sampled every 10 m. */
export function areaAtLeast(values: number[], n: number, spacing: number, threshold: number): number {
  const ext = (n - 1) * spacing, step = 10, m = Math.round(ext / step)
  let count = 0
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
    const e = -ext / 2 + (j + 0.5) * step, nn = ext / 2 - (i + 0.5) * step
    if (gridAt(values, n, spacing, e, nn) >= threshold) count++
  }
  return (count * step * step) / 1e6
}

/**
 * Marching squares on the grid at `threshold`, with an outside border below any threshold so
 * every region closes along the grid edge. Returns segments as [east, north] pairs in metres.
 */
export function contour(values: number[], n: number, spacing: number, threshold: number): [number, number][][] {
  const N = n + 2, half = (n - 1) / 2
  const at = (r: number, c: number) => (r < 1 || c < 1 || r > n || c > n ? -1e9 : values[(r - 1) * n + (c - 1)])
  // grid (padded) coords -> metres; the padding ring sits half a step outside the grid edge
  const toM = (r: number, c: number): [number, number] => {
    const cc = Math.max(-0.5, Math.min(n - 0.5, c - 1)), rr = Math.max(-0.5, Math.min(n - 0.5, r - 1))
    return [(cc - half) * spacing, (half - rr) * spacing]
  }
  const segs: [number, number][][] = []
  const lerp = (a: number, b: number) => { const t = (threshold - a) / (b - a); return Math.max(0, Math.min(1, t)) }
  for (let r = 0; r < N - 1; r++) for (let c = 0; c < N - 1; c++) {
    const tl = at(r, c), tr = at(r, c + 1), br = at(r + 1, c + 1), bl = at(r + 1, c)
    const k = (tl >= threshold ? 8 : 0) | (tr >= threshold ? 4 : 0) | (br >= threshold ? 2 : 0) | (bl >= threshold ? 1 : 0)
    if (k === 0 || k === 15) continue
    const top = toM(r, c + lerp(tl, tr)), right = toM(r + lerp(tr, br), c + 1)
    const bottom = toM(r + 1, c + lerp(bl, br)), left = toM(r + lerp(tl, bl), c)
    const centre = (tl + tr + br + bl) / 4 >= threshold
    switch (k) {
      case 1: case 14: segs.push([left, bottom]); break
      case 2: case 13: segs.push([bottom, right]); break
      case 3: case 12: segs.push([left, right]); break
      case 4: case 11: segs.push([top, right]); break
      case 6: case 9: segs.push([top, bottom]); break
      case 7: case 8: segs.push([left, top]); break
      case 5: if (centre) { segs.push([left, top], [bottom, right]) } else { segs.push([left, bottom], [top, right]) } break
      case 10: if (centre) { segs.push([top, right], [left, bottom]) } else { segs.push([left, top], [bottom, right]) } break
    }
  }
  return segs
}

/** Single-hue sequential ramps (dark → bright) for each metric, as RGB stops at 0, 50, 100 %. */
export const RAMPS: Record<Metric, [number, number, number][]> = {
  sun: [[46, 28, 6], [184, 116, 26], [255, 231, 163]],
  earth: [[8, 24, 56], [44, 110, 214], [186, 220, 255]],
  both: [[6, 40, 36], [24, 150, 130], [178, 245, 228]],
}

export function rampColor(metric: Metric, pct: number): [number, number, number] {
  const s = RAMPS[metric]
  const t = Math.max(0, Math.min(1, pct / 100)) * 2
  const i = Math.min(1, Math.floor(t)), f = t - i
  return [0, 1, 2].map((k) => Math.round(s[i][k] + (s[i + 1][k] - s[i][k]) * f)) as [number, number, number]
}

export const rampCss = (metric: Metric) =>
  `linear-gradient(to right, ${RAMPS[metric].map((c, i) => `rgb(${c.join(',')}) ${i * 50}%`).join(', ')})`
