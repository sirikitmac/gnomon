/**
 * Approximate geometry for drawing Earth in the Moon's sky: its distance from the Moon and which way
 * it is turned (spin axis and the longitude facing the Moon). Uses short series from Meeus,
 * "Astronomical Algorithms" (Moon position ~0.3°, distance ~1%, Sun ~0.01°). This only orients the
 * picture; Rocky's Sun and Earth positions still come from JPL Horizons.
 */

export type V3 = [number, number, number]

const RAD = Math.PI / 180
const OBLIQUITY = 23.4393 * RAD
export const MOON_RADIUS_KM = 1737.4
export const EARTH_RADIUS_KM = 6371.0

const sin = (deg: number) => Math.sin(deg * RAD)
const cos = (deg: number) => Math.cos(deg * RAD)
const unit = (lonDeg: number, latDeg: number): V3 => [cos(latDeg) * cos(lonDeg), cos(latDeg) * sin(lonDeg), sin(latDeg)]

const daysSinceJ2000 = (t: Date) => (t.getTime() - Date.UTC(2000, 0, 1, 12)) / 86_400_000

/** Geocentric ecliptic longitude/latitude (deg) and distance (km) of the Moon. */
export function moonEcliptic(t: Date) {
  const d = daysSinceJ2000(t)
  const L0 = 218.316 + 13.176396 * d
  const Mp = 134.963 + 13.064993 * d // Moon's mean anomaly
  const M = 357.529 + 0.98560028 * d // Sun's mean anomaly
  const D = 297.85 + 12.190749 * d // mean elongation
  const F = 93.272 + 13.22935 * d // argument of latitude
  const lon = L0 + 6.289 * sin(Mp) + 1.274 * sin(2 * D - Mp) + 0.658 * sin(2 * D) + 0.214 * sin(2 * Mp) - 0.186 * sin(M) - 0.114 * sin(2 * F)
  const lat = 5.128 * sin(F) + 0.281 * sin(Mp + F) + 0.278 * sin(Mp - F) + 0.173 * sin(2 * D - F)
  const km = 385000.56 - 20905.355 * cos(Mp) - 3699.111 * cos(2 * D - Mp) - 2955.968 * cos(2 * D) - 569.925 * cos(2 * Mp)
  return { lon, lat, km }
}

/** Geocentric ecliptic longitude (deg) of the Sun. */
export function sunEclipticLon(t: Date) {
  const d = daysSinceJ2000(t)
  const L = 280.46 + 0.9856474 * d
  const g = 357.528 + 0.9856003 * d
  return L + 1.915 * sin(g) + 0.02 * sin(2 * g)
}

/** Greenwich mean sidereal time (deg). */
export const gmst = (t: Date) => 280.46061837 + 360.98564736629 * daysSinceJ2000(t)

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: V3): V3 => scale(a, 1 / Math.hypot(...a))

/** Equatorial (x = vernal equinox, z = Earth's north pole) → ecliptic. */
const eqToEcl = ([x, y, z]: V3): V3 => [x, y * Math.cos(OBLIQUITY) + z * Math.sin(OBLIQUITY), -y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY)]

/**
 * Earth's pose in the scene's Moon-fixed frame.
 * earthDir is the unit vector from the Moon's centre to Earth (from Horizons, via a site's az/el).
 * Together with the Moon's spin axis (IAU WGCCRE model; the scene's +y) it pins down how the
 * ecliptic frame sits in the Moon-fixed frame (TRIAD method).
 * Returns Earth's distance in Moon radii and the scene-frame directions of Earth's north pole and of
 * the point on Earth's equator at 0° longitude (Greenwich).
 */
export function earthPose(t: Date, earthDir: V3) {
  const m = moonEcliptic(t)
  const moonGeo = scale(unit(m.lon, m.lat), m.km)
  const sunGeo = scale(unit(sunEclipticLon(t), 0), 149_597_870.7)
  const eEcl = norm(scale(moonGeo, -1)) // Moon → Earth
  const sEcl = norm(sub(sunGeo, moonGeo)) // Moon → Sun
  // Moon's north pole (IAU WGCCRE 2015, main terms), equatorial → ecliptic
  const d = daysSinceJ2000(t)
  const E1 = 125.045 - 0.0529921 * d
  const poleEcl = eqToEcl(unit(269.9949 - 3.8787 * sin(E1), 66.5392 + 1.5419 * cos(E1)))

  const triad = (a: V3, b: V3) => {
    const t1 = norm(a)
    const t2 = norm(cross(a, b))
    return [t1, t2, cross(t1, t2)] as const
  }
  const [v1, v2, v3] = triad(eEcl, poleEcl)
  const [w1, w2, w3] = triad(earthDir, [0, 1, 0])
  // R = W · Vᵀ maps ecliptic vectors into the scene frame.
  const toScene = (p: V3): V3 => {
    const a = p[0] * v1[0] + p[1] * v1[1] + p[2] * v1[2]
    const b = p[0] * v2[0] + p[1] * v2[1] + p[2] * v2[2]
    const c = p[0] * v3[0] + p[1] * v3[1] + p[2] * v3[2]
    return [a * w1[0] + b * w2[0] + c * w3[0], a * w1[1] + b * w2[1] + c * w3[1], a * w1[2] + b * w2[2] + c * w3[2]]
  }
  const g = gmst(t)
  return {
    distance: m.km / MOON_RADIUS_KM,
    north: toScene(eqToEcl([0, 0, 1])),
    greenwich: toScene(eqToEcl([cos(g), sin(g), 0])),
    sun: toScene(sEcl), // for checks against Horizons
  }
}
