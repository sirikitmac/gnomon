# Rocky · Lunar Landing Site Navigator

NASA Space Apps Challenge 2026: *Lunar Landing Site Navigator*.

Pick a lunar landing site and date, and Rocky tells you whether your mission has **power** (Sun above the terrain) and **direct-to-Earth comms** (Earth above the terrain), how long that lasts, and what happens if the landing **slips**.

> NASA's tools tell you where the Sun is. Rocky tells you whether your mission survives, and what happens when the date slips.

## What's here

```
app/        React + Vite dashboard (3D Moon, mission setup, verdict, timeline, horizon view)
pipeline/   Python: builds the data file from NASA data (or mock data for UI work)
docs/       data-format.md: the JSON contract between pipeline and app
```

## Run the dashboard

```bash
cd app
npm install
npm run dev
```

It reads `app/public/data/sites.json`. The repo ships **mock data** (a banner says so in the UI).

**Real Moon texture (optional):** download the color map from the NASA SVS *CGI Moon Kit* (`lroc_color_poles_2k.tif` or similar), convert to JPG, and save as `app/public/textures/moon_color.jpg`. Without it the app draws a procedural Moon.

## Data

### Mock (no network, no NASA files)

```bash
cd pipeline
python generate_mock.py
```

Simplified orbital geometry + synthetic terrain. Same JSON shape as the real data. **Don't present mock numbers as results.**

### Real NASA data

```bash
cd pipeline
pip install -r requirements.txt
cp dems.example.json dems.json   # then list your downloaded DEMs per site
python build_dataset.py --start 2026-12-01 --stop 2027-03-01
```

1. **Sun/Earth positions:** JPL Horizons API (no key needed), hourly, per site. Cached in `pipeline/raw/`.
2. **Terrain skyline:** from LOLA DEM GeoTIFFs (PGDA 5 m site DEMs + a wider LOLA polar mosaic for distant ridges). 360 bins, lunar curvature included.
3. **Visibility:** body centre elevation > skyline at its azimuth.

Sites without a DEM fall back to a smooth-sphere horizon and are labelled low confidence.

Site coordinates in `pipeline/sites.json` are approximate starting values: verify each one against its source before the final run.

### Data sources

- JPL Horizons: https://ssd.jpl.nasa.gov/horizons/
- PGDA High-Resolution LOLA Topography for Lunar South Pole Sites (5 m): https://pgda.gsfc.nasa.gov/products/78
- Method: Mazarico et al. 2011, Illumination conditions of the lunar polar regions using LOLA topography: https://ntrs.nasa.gov/citations/20120010094
- Validation: PGDA Lunar Polar Illumination: https://pgda.gsfc.nasa.gov/products/69
- LOLA gridded polar DEMs (PDS / PGDA)
- Official challenge resources: JPL Horizons, Moon Trek (https://trek.nasa.gov/moon/), Quickmap (https://quickmap.lroc.asu.edu/), CSA Moon Exploration
- Moon Trek, PGDA Lunar Polar Illumination, NASA SVS south pole illumination 2025–2028 (validation)
- NASA Artemis III candidate regions; Apollo coordinates (NSSDCA). Non-NASA sites (Chang'e-7, Chandrayaan-3) are labelled with their real source.

## How the verdict works

For the mission window (landing → landing + length):
- **Coverage** = % of hours with the requirement met (Sun, or Sun + Earth if comms are required)
- **Longest blackout** = longest continuous stretch without it
- **GO** ≥ 75% coverage and blackout ≤ 24 h · **RISKY** ≥ 45% and ≤ 96 h · otherwise **NO-GO**

Thresholds live in `app/src/lib/engine.ts` (`verdictFor`).
