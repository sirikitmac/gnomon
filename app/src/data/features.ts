/**
 * Named south polar features (75°S to 90°S) from the IAU Gazetteer of Planetary
 * Nomenclature (USGS), https://planetarynames.wr.usgs.gov/ , retrieved 2026-11-13.
 * Lettered satellite craters are left out. Longitudes are degrees east (-180 to 180).
 */
export interface Feature {
  name: string
  lat: number
  lon: number
  diameterKm: number
  type: 'Crater' | 'Mons' | 'Lacus'
}

export const SOUTH_POLE_FEATURES: Feature[] = [
  { name: "Amundsen", lat: -84.44, lon: 83.07, diameterKm: 103.39, type: "Crater" },
  { name: "Ashbrook", lat: -81.1, lon: -110.58, diameterKm: 157.68, type: "Crater" },
  { name: "Bay", lat: -88.76, lon: -36.85, diameterKm: 3.5, type: "Crater" },
  { name: "Braude", lat: -81.82, lon: 158.88, diameterKm: 11.28, type: "Crater" },
  { name: "Brill", lat: -88.27, lon: -93.41, diameterKm: 17, type: "Crater" },
  { name: "Burbidge", lat: -86.35, lon: 48.6, diameterKm: 21, type: "Crater" },
  { name: "Cabeus", lat: -85.33, lon: -42.13, diameterKm: 100.58, type: "Crater" },
  { name: "Cartwright", lat: -87.65, lon: -46.95, diameterKm: 17, type: "Crater" },
  { name: "Dawa", lat: -85.45, lon: 31.66, diameterKm: 0.65, type: "Crater" },
  { name: "De Forest", lat: -76.94, lon: -163.33, diameterKm: 56.26, type: "Crater" },
  { name: "de Gerlache", lat: -88.48, lon: -88.34, diameterKm: 32.71, type: "Crater" },
  { name: "Demonax", lat: -78.09, lon: 59.36, diameterKm: 121.93, type: "Crater" },
  { name: "Drygalski", lat: -79.57, lon: -87.18, diameterKm: 162.49, type: "Crater" },
  { name: "Faustini", lat: -87.18, lon: 84.31, diameterKm: 42.48, type: "Crater" },
  { name: "Floss", lat: -84.28, lon: 42.27, diameterKm: 9, type: "Crater" },
  { name: "Ganswindt", lat: -79.42, lon: 111.17, diameterKm: 77.52, type: "Crater" },
  { name: "Haworth", lat: -87.45, lon: -5.17, diameterKm: 51.42, type: "Crater" },
  { name: "Haynes", lat: -88.75, lon: 167.39, diameterKm: 17, type: "Crater" },
  { name: "Hedervari", lat: -81.77, lon: 85.6, diameterKm: 74.14, type: "Crater" },
  { name: "Henson", lat: -88.57, lon: -130.63, diameterKm: 43, type: "Crater" },
  { name: "Ibn Bajja", lat: -86.3, lon: -75.04, diameterKm: 11.98, type: "Crater" },
  { name: "Idel'son", lat: -81.35, lon: 112.69, diameterKm: 59.82, type: "Crater" },
  { name: "Jaci", lat: -85.42, lon: 31.23, diameterKm: 1.8, type: "Crater" },
  { name: "Kocher", lat: -84.47, lon: -134.02, diameterKm: 24.03, type: "Crater" },
  { name: "Kuhn", lat: -84.48, lon: -152.48, diameterKm: 16.61, type: "Crater" },
  { name: "Lacus Tenebrarum", lat: -86.71, lon: -87.67, diameterKm: 85, type: "Lacus" },
  { name: "Laveran", lat: -81.8, lon: -159.78, diameterKm: 12.52, type: "Crater" },
  { name: "Lhamu", lat: -85.92, lon: -1.62, diameterKm: 1.4, type: "Crater" },
  { name: "Malapert", lat: -85, lon: 11.4, diameterKm: 72.38, type: "Crater" },
  { name: "Malinkin", lat: -87.22, lon: 75.94, diameterKm: 8.28, type: "Crater" },
  { name: "Marvin", lat: -89.13, lon: -87.78, diameterKm: 4.6, type: "Crater" },
  { name: "Masina", lat: -85.42, lon: 32.15, diameterKm: 1.4, type: "Crater" },
  { name: "Mons Amundsen", lat: -82.57, lon: 75.71, diameterKm: 38, type: "Mons" },
  { name: "Mons Cabeus", lat: -83.67, lon: -36.16, diameterKm: 43, type: "Mons" },
  { name: "Mons Kocher", lat: -85.46, lon: -118.06, diameterKm: 67, type: "Mons" },
  { name: "Mons Malapert", lat: -85.98, lon: -1.67, diameterKm: 67, type: "Mons" },
  { name: "Mons Mouton", lat: -84.6, lon: 31, diameterKm: 130, type: "Mons" },
  { name: "Nefed'ev", lat: -81.07, lon: 135.77, diameterKm: 52.94, type: "Crater" },
  { name: "Newton", lat: -76.52, lon: -17.44, diameterKm: 83.85, type: "Crater" },
  { name: "Nobile", lat: -85.28, lon: 53.27, diameterKm: 79.27, type: "Crater" },
  { name: "Oberbeck", lat: -83.55, lon: 68.14, diameterKm: 58, type: "Crater" },
  { name: "Rubin", lat: -82.82, lon: 77.65, diameterKm: 4, type: "Crater" },
  { name: "Schomberger", lat: -76.64, lon: 24.69, diameterKm: 85.8, type: "Crater" },
  { name: "Scott", lat: -82.35, lon: 48.52, diameterKm: 107.82, type: "Crater" },
  { name: "Shackleton", lat: -89.67, lon: 129.78, diameterKm: 20.92, type: "Crater" },
  { name: "Shoemaker", lat: -88.14, lon: 45.91, diameterKm: 51.82, type: "Crater" },
  { name: "Slater", lat: -88.08, lon: 111.29, diameterKm: 25.12, type: "Crater" },
  { name: "Spudis", lat: -89.51, lon: -84.61, diameterKm: 13, type: "Crater" },
  { name: "Stose", lat: -86.38, lon: 32.13, diameterKm: 16.7, type: "Crater" },
  { name: "Svedberg", lat: -81.68, lon: 65.15, diameterKm: 15.34, type: "Crater" },
  { name: "Sverdrup", lat: -88.32, lon: -153.39, diameterKm: 32.83, type: "Crater" },
  { name: "Tooley", lat: -88.04, lon: 51.31, diameterKm: 7, type: "Crater" },
  { name: "von Baeyer", lat: -81.8, lon: 61.87, diameterKm: 13.46, type: "Crater" },
  { name: "Wapowski", lat: -83.08, lon: 53.79, diameterKm: 11.45, type: "Crater" },
  { name: "Whitaker", lat: -84.67, lon: 0.69, diameterKm: 20, type: "Crater" },
  { name: "Wiechert", lat: -84.03, lon: 164.7, diameterKm: 40.82, type: "Crater" },
  { name: "Zeeman", lat: -75.07, lon: -135.06, diameterKm: 186.56, type: "Crater" },
]
