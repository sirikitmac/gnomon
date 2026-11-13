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

It reads `app/public/data/sites.json`, which now holds **real NASA-derived data** (Dec 2026 – Mar 2027).

**Moon textures:** `app/public/textures/` holds the NASA SVS CGI Moon Kit (svs.gsfc.nasa.gov/4720) color map with filled poles (`moon_color.jpg` 4k, `moon_color_8k.jpg` 8k) and a normal map computed from the LOLA elevation map `ldem_16_uint.tif` with 5x vertical exaggeration (`moon_normal.jpg`). Crater names come from the IAU Gazetteer of Planetary Nomenclature (USGS).

## Data

### Mock (no network, no NASA files)

```bash
cd pipeline
python generate_mock.py            # writes app/public/data/sites.mock.json
```

It writes to `sites.mock.json`, so it never touches the real data. Use `--replace` only if you really want the app to load mock data. Simplified orbital geometry + synthetic terrain. Same JSON shape as the real data. **Don't present mock numbers as results.**

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

### Site 3D terrain and sun exposure

```bash
cd pipeline
python build_site_terrain.py      # ~80 s for all sites; needs the DEMs in dems.json
```

Writes `app/public/data/terrain/` (format in `docs/data-format.md`): a 6 × 6 km height grid at 20 m around each site, and a 3 × 3 km grid of points every 100 m, each with its own terrain skyline, scored over the whole Sun/Earth series (sun %, Earth %, both %). Every grid point uses the landing site's Horizons Sun/Earth directions: within 1.5 km they change by < 0.1°, and the skylines are binned in the site's own azimuth frame so the polar meridian convergence doesn't matter. Sites without a 5 m / 20 m DEM (Apollo 11, Chandrayaan-3 with 240 m only) get no close-up.

### Data sources

- JPL Horizons: https://ssd.jpl.nasa.gov/horizons/
- PGDA High-Resolution LOLA Topography for Lunar South Pole Sites (5 m): https://pgda.gsfc.nasa.gov/products/78
- Method: Mazarico et al. 2011, Illumination conditions of the lunar polar regions using LOLA topography: https://ntrs.nasa.gov/citations/20120010094
- Validation: PGDA Lunar Polar Illumination: https://pgda.gsfc.nasa.gov/products/69
- LOLA gridded polar DEMs (PDS / PGDA)
- Official challenge resources: JPL Horizons, Moon Trek (https://trek.nasa.gov/moon/), Quickmap (https://quickmap.lroc.asu.edu/), CSA Moon Exploration
- Moon Trek, PGDA Lunar Polar Illumination, NASA SVS south pole illumination 2025–2028 (validation)
- NASA Artemis III candidate regions; Apollo coordinates (NSSDCA). Non-NASA sites (Chang'e-7, Chandrayaan-3) are labelled with their real source.

## Planning tools

- **Launch calendar**: every day Nov 2026 – Dec 2028 coloured by the verdict of a mission landing at 00:00 UTC that day (current settings). Click a day to land then.
- **Plan it for me**: searches all sites × landing times (6 h steps, from today) and lists the top 5 (verdict, then coverage, then shortest blackout; same-site results ≥ 3 days apart).
- **Scenarios**: one-click demo presets with an explanation. How each date was chosen is documented in `app/src/lib/presets.ts`. The Athena preset is a similar low-Sun period in our data range, **not** the real March 2025 landing (our data starts Nov 2026).
- **Share**: the plan lives in the URL (`?site=…&t=…&days=…&comms=…&slip=…&sun=…`); Copy link, a print-ready one-page report (Print / Save as PDF) and a CSV of the all-sites table.
- **Sky view**: first-person 360° panorama with the terrain skyline, the Sun and Earth, play/pause through the mission. Vertical scale is exaggerated (the factor is shown).
- **Learn**: a 7-step plain-language tour of the interface and the ideas behind it.

## How the verdict works

For the mission window (landing → landing + length):
- **Coverage** = % of hours with the requirement met (Sun, or Sun + Earth if comms are required)
- **Longest blackout** = longest continuous stretch without it
- **GO** ≥ 75% coverage and blackout ≤ 24 h · **RISKY** ≥ 45% and ≤ 96 h · otherwise **NO-GO**

Thresholds live in `app/src/lib/engine.ts` (`verdictFor`).
