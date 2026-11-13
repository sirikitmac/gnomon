# Data format (`app/public/data/sites.json`)

The frontend reads one JSON file. The mock generator and the real NASA pipeline both write this same shape, so swapping mock data for real data needs no frontend changes.

```jsonc
{
  "meta": {
    "mock": true,                  // false for real NASA-derived data
    "generatedBy": "pipeline/generate_mock.py",
    "start": "2026-12-01T00:00:00Z", // UTC time of index 0
    "stepHours": 1,                // spacing between samples
    "count": 2160,                 // samples per series
    "notes": "..."
  },
  "sites": [
    {
      "id": "malapert",
      "name": "Malapert Massif",
      "lat": -85.9,                // degrees, south negative
      "lonEast": 0.0,              // degrees EAST longitude (Horizons convention)
      "role": "Comms",             // Power | Comms | Science trade-off | Real mission | Contrast
      "story": "One-line reason this site is in the app",
      "source": "Who the coordinates come from",
      "terrain": "PGDA 5 m (Site23) + LOLA 20 m | LOLA 240 m | none (smooth sphere) | synthetic (mock)",
      "confidence": "high | medium | low | mock", // from the finest DEM pixel: <=5 m high, <=20 m medium, coarser or none low
      "skyline": [/* 360 numbers: terrain horizon elevation (deg) at azimuth 0..359 */],
      "series": {                  // columnar: index i = meta.start + i * stepHours
        "sunAz":   [/* deg, clockwise from north */],
        "sunEl":   [/* deg above flat horizon */],
        "earthAz": [],
        "earthEl": [],
        "sunVis":  [/* 1 if Sun centre above skyline, else 0 */],
        "earthVis":[/* 1 if Earth centre above skyline, else 0 */]
      }
    }
  ]
}
```

Conventions
- Azimuth: 0 = north, 90 = east, clockwise. Elevation: degrees above the flat horizon.
- `skyline[a]` is the highest terrain angle seen at azimuth `a`, including lunar curvature (can be negative on a peak).
- Visible means the body's centre elevation is greater than `skyline[round(az) % 360]`.
- Columnar arrays keep the file small (~60 KB per site per 90 days at 1 h steps).

# Site 3D data (`app/public/data/terrain/`)

Written by `pipeline/build_site_terrain.py` for every site with a 5 m or 20 m DEM. Sites with no DEM or only a coarse one get just `<id>.json` with `available: false, coarse: true, reason`.

| File | Contents |
| --- | --- |
| `<id>.bin` | Terrain heights, Float32 little-endian, `size × size` (301 × 301, 20 m → 6 km), row-major, row 0 = north edge, column 0 = west edge. Metres relative to the landing point's ground (centre sample = 0), from the site's tangent plane (curvature drop d²/2R included). ~353 KB. |
| `<id>.sky.bin` | Skyline of each exposure-grid point: Uint8, `(n·n) × 360`, point-major in the same order as the grids; degrees = `v / 10 − 5` (clipped to −5…20.5°, far above any polar Sun/Earth elevation). Used by the 3D view to shade terrain hidden by distant ridges at the current time. |
| `<id>.json` | `terrain` (size, spacing_m, extent_m, min/max height, source, resolution note) and `exposure` (spacing_m = 100, n = 31, `sunPct[]`, `earthPct[]`, `bothPct[]`, `height_m[]` per point, period, rule, direction note), plus `checks` (centre vs `sites.json`). |

Exposure grid: 31 × 31 points every 100 m (3 × 3 km), each with its own skyline (local 5 m + wide 20 m DEM, observer 2 m, same rule as `sites.json`), tested against the whole series in `sites.json`. **Direction approximation:** every point uses the landing site's Horizons Sun/Earth az/el. Skylines are binned in the site's own azimuth frame (so there is no meridian-convergence error near the pole) and elevation is corrected for the tilt of the local vertical (≤ 0.05°); parallax is < 0.001°.
