import type { Analysis, Site } from './types'

/** Angle difference folded into (-180, 180]. */
export function wrap180(deg: number): number {
  const d = ((deg % 360) + 360) % 360
  return d > 180 ? d - 360 : d
}

/** Terrain horizon elevation at any azimuth, linearly interpolated between the 1° skyline bins. */
export function skylineAt(skyline: number[], az: number): number {
  const a = ((az % 360) + 360) % 360
  const i = Math.floor(a)
  const f = a - i
  return skyline[i % 360] * (1 - f) + skyline[(i + 1) % 360] * f
}

/** Highest elevation the view shows; anything above is pinned to the top edge with its real value. */
export const SKY_CAP_DEG = 30

/**
 * Vertical range for the panorama: the skyline plus the Sun and Earth paths during the mission,
 * capped so equatorial sites (Sun up to ~90°) don't flatten the polar ridges to nothing.
 */
export function skyRange(site: Site, a: Analysis): { elMin: number; elMax: number } {
  let lo = Infinity, hi = -Infinity
  for (const v of site.skyline) { lo = Math.min(lo, v); hi = Math.max(hi, v) }
  const s = site.series
  let bodyLo = Infinity
  for (let i = a.startIdx; i < a.endIdx; i++) {
    hi = Math.max(hi, s.sunEl[i], s.earthEl[i])
    bodyLo = Math.min(bodyLo, s.sunEl[i], s.earthEl[i])
  }
  // Show bodies a little below the lowest ridge (they're hidden there anyway), not all the way down.
  lo = Math.min(lo, Math.max(bodyLo, lo - 3))
  hi = Math.min(SKY_CAP_DEG, hi + 1.5)
  lo = lo - 1
  if (hi - lo < 6) { const mid = (hi + lo) / 2; hi = mid + 3; lo = mid - 3 }
  return { elMin: lo, elMax: hi }
}

/** Field of view (degrees of azimuth) that keeps ridges readable at a given width in px. */
export function fovFor(widthPx: number): number {
  if (widthPx >= 900) return 360
  if (widthPx >= 560) return 240
  return 150
}

/** How much taller things look than they really are: vertical px per degree ÷ horizontal px per degree. */
export function exaggeration(widthPx: number, fov: number, plotH: number, elMin: number, elMax: number): number {
  return (plotH / (elMax - elMin)) / (widthPx / fov)
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
export const compassPoints = COMPASS.map((label, i) => ({ label, az: i * 45 }))
