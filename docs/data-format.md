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
      "terrain": "PGDA 5 m | LOLA 20 m | synthetic (mock)",
      "confidence": "high | medium | low | mock",
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
