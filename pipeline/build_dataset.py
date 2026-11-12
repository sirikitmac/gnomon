"""Build app/public/data/sites.json from real NASA data.

Steps per site: (1) Sun/Earth az/el from JPL Horizons, (2) skyline from LOLA DEMs,
(3) visibility = body centre above the skyline at its azimuth.

Usage:
  pip install -r requirements.txt
  python build_dataset.py --start 2026-12-01 --stop 2027-03-01
DEM files are listed per site in dems.json (see dems.example.json).
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from horizons import fetch_site
from skyline import combine, skyline_from_dem, smooth_horizon

HERE = Path(__file__).parent
OUT = HERE.parent / "app" / "public" / "data" / "sites.json"


def pixel_size_m(path):
    """Ground pixel size of a DEM, read from the file (not from its label)."""
    import rasterio
    with rasterio.open(path) as ds:
        return abs(ds.transform.a)


def confidence_for(finest_m):
    """high: a 5 m site DEM; medium: a 20 m-class mosaic; low: anything coarser.
    Sites with no DEM at all are also 'low' (smooth sphere), labelled by terrain."""
    if finest_m <= 5.5:
        return "high"
    if finest_m <= 20.5:
        return "medium"
    return "low"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2026-12-01")
    ap.add_argument("--stop", default="2027-03-01")
    ap.add_argument("--step", default="1h")
    ap.add_argument("--only", help="comma-separated site ids")
    args = ap.parse_args()

    sites = json.loads((HERE / "sites.json").read_text(encoding="utf-8"))["sites"]
    if args.only:
        keep = set(args.only.split(","))
        sites = [s for s in sites if s["id"] in keep]
    dem_cfg_path = HERE / "dems.json"
    dem_cfg = json.loads(dem_cfg_path.read_text(encoding="utf-8")) if dem_cfg_path.exists() else {}

    out_sites, count = [], None
    for s in sites:
        print(f"[{s['name']}]")
        series = fetch_site(s, args.start, args.stop, args.step, HERE / "raw")
        sun, earth = series["sun"], series["earth"]
        n = min(len(sun), len(earth))
        count = n if count is None else min(count, n)

        dems = dem_cfg.get(s["id"], [])
        if dems:
            sky = combine(*[skyline_from_dem(HERE / d["path"], s["lat"], s["lonEast"], d.get("maxRangeKm", 0) * 1000 or None) for d in dems])
            terrain = " + ".join(d["label"] for d in dems)
            confidence = confidence_for(min(pixel_size_m(HERE / d["path"]) for d in dems))
        else:
            sky = smooth_horizon()
            terrain, confidence = "none (smooth sphere)", "low"
        sky = np.round(sky, 3).tolist()

        cols = {k: [] for k in ("sunAz", "sunEl", "earthAz", "earthEl", "sunVis", "earthVis")}
        for i in range(n):
            for key, rows in (("sun", sun), ("earth", earth)):
                _, az, el = rows[i]
                cols[key + "Az"].append(round(az, 3))
                cols[key + "El"].append(round(el, 3))
                cols[key + "Vis"].append(int(el > sky[int(round(az)) % 360]))
        out_sites.append({
            **{k: s[k] for k in ("id", "name", "lat", "lonEast", "role", "story", "source")},
            "terrain": terrain,
            "confidence": confidence,
            "skyline": sky,
            "series": cols,
        })
        sv, ev = cols["sunVis"], cols["earthVis"]
        print(f"  sun {100*sum(sv)/n:.1f}%  earth {100*sum(ev)/n:.1f}%  terrain: {terrain}")

    for o in out_sites:  # trim to a common length
        for k in o["series"]:
            o["series"][k] = o["series"][k][:count]

    start_iso = datetime.strptime(args.start, "%Y-%m-%d").replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
    step_h = float(args.step.rstrip("h")) if args.step.endswith("h") else 1.0
    data = {
        "meta": {
            "mock": False,
            "generatedBy": "pipeline/build_dataset.py",
            "start": start_iso,
            "stepHours": step_h,
            "count": count,
            "notes": "Sun/Earth from JPL Horizons; terrain from LRO LOLA (PGDA). Visibility = body centre above skyline.",
        },
        "sites": out_sites,
    }
    OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
