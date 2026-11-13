"""Build the Site 3D data: a terrain patch and a sun-exposure grid around each landing site.

For each site with a fine DEM (listed in dems.json) this writes, to app/public/data/terrain/:
  <id>.bin      terrain heights, Float32 little-endian, SIZE x SIZE, row-major, north row first,
                west column first. Metres relative to the landing point's ground, measured from
                the site's tangent plane (lunar curvature drop d^2/2R included).
  <id>.sky.bin  skyline of every exposure-grid point, Uint8, (N*N) x 360, deg = value / 10 - 5
                (clipped to -5..20.5 deg; polar Sun/Earth never get that high, so visibility is exact).
  <id>.json     metadata + the exposure grid (sun %, Earth %, both % per point).
Sites with no DEM, or only a coarse one (> 20 m), get a JSON with available: false.

Exposure: every grid point gets its own skyline (local 5 m + wide 20 m DEM, observer 2 m, the
same angle rule as skyline.py), then the whole Sun/Earth series in sites.json is tested against it.
Directions: all points use the landing site's Horizons Sun/Earth az/el. Skylines are binned in the
site's own azimuth frame, so there is no meridian-convergence error; elevation is corrected for the
tilt of the local vertical (offset / R, <= 0.05 deg within 1.5 km). Parallax over a few km is
< 0.0001 deg for the Sun and ~0.0004 deg for the Earth, far below the 1 deg skyline bins.

Usage:  python build_site_terrain.py [--only malapert,haworth]
Needs the DEMs from dems.json in raw/ and app/public/data/sites.json (run build_dataset.py first).
"""
import argparse
import json
import time
from pathlib import Path

import numpy as np

from build_dataset import pixel_size_m
from skyline import MOON_R, DemWindow, combine

HERE = Path(__file__).parent
DATA = HERE.parent / "app" / "public" / "data"
OUT = DATA / "terrain"

T_SIZE, T_SPACING = 301, 20.0  # terrain patch: 301 x 301 samples, 20 m -> 6 km; centre sample = site
E_N, E_SPACING = 31, 100.0  # exposure grid: 31 x 31 points, 100 m -> 3 km
OBSERVER_H = 2.0
SKY_LO, SKY_SCALE = -5.0, 10.0  # Uint8 skyline encoding


def grid(n, spacing):
    """East/north offsets of an n x n grid centred on the site, north row first, west column first."""
    half = (n - 1) / 2
    k = (np.arange(n) - half) * spacing
    east = np.tile(k, n)
    north = np.repeat(-k, n)  # row 0 = north
    return east, north


def visibility(sky, east, north, az, el):
    """(points, times) bool: body centre above each point's skyline. el corrected for the tilt of
    the point's local vertical (it leans by offset / R towards the offset direction)."""
    a = np.radians(az)
    corr = np.degrees((east[:, None] * np.sin(a)[None, :] + north[:, None] * np.cos(a)[None, :]) / MOON_R)
    bins = np.round(az).astype(int) % 360
    return (el[None, :] + corr) > sky[:, bins]


def build_site(site, dems):
    t_site = time.time()
    sid = site["id"]
    print(f"[{site['name']}]")
    windows = []
    for d in dems:
        t = time.time()
        rng = d.get("maxRangeKm", 0) * 1000 or None
        w = DemWindow(HERE / d["path"], site["lat"], site["lonEast"], (rng + 4000) if rng else 1e9)
        windows.append((d, w, rng))
        print(f"  load {d['label']}: {w.dem.shape[1]}x{w.dem.shape[0]} px in {time.time() - t:.1f} s")

    # --- 1. terrain patch: best DEM per sample, fine DEMs box-filtered to the 20 m spacing ---
    t = time.time()
    te, tn = grid(T_SIZE, T_SPACING)
    h = np.full(te.shape, np.nan)
    used = []
    for d, w, _ in windows:
        box = max(1, int(round(T_SPACING / (w.px / w.k))))
        hv = w.height_bilinear(te, tn, box_px=box)
        fill = np.isnan(h) & ~np.isnan(hv)
        if fill.any():
            used.append((d["label"], int(fill.sum())))
            h[fill] = hv[fill]
    if np.isnan(h).any():
        raise RuntimeError(f"{sid}: {int(np.isnan(h).sum())} terrain samples have no DEM data")
    ci = (T_SIZE * T_SIZE) // 2
    z = h - h[ci] - (te ** 2 + tn ** 2) / (2 * MOON_R)
    z = z.astype("<f4")
    (OUT / f"{sid}.bin").write_bytes(z.tobytes())
    print(f"  terrain {T_SIZE}x{T_SIZE} @ {T_SPACING:.0f} m: {z.min():.0f} .. {z.max():.0f} m "
          f"({', '.join(f'{l}: {100 * c / z.size:.0f}%' for l, c in used)}) in {time.time() - t:.1f} s")

    # --- 2. exposure grid: one skyline per point, then the whole series ---
    t = time.time()
    ee, en = grid(E_N, E_SPACING)
    parts, ground = [], None
    for d, w, rng in windows:
        sky, g = w.skylines(ee, en, max_range_m=rng, observer_h=OBSERVER_H)
        parts.append(sky)
        if ground is None:
            ground = g
        else:
            ground = np.where(np.isnan(ground), g, ground)
        print(f"  skylines {d['label']}: {len(ee)} points in {time.time() - t:.1f} s")
        t = time.time()
    sky = combine(*parts)

    s = site["series"]
    sun = visibility(sky, ee, en, np.array(s["sunAz"]), np.array(s["sunEl"]))
    earth = visibility(sky, ee, en, np.array(s["earthAz"]), np.array(s["earthEl"]))
    sun_pct, earth_pct, both_pct = (100 * sun.mean(1), 100 * earth.mean(1), 100 * (sun & earth).mean(1))
    print(f"  visibility over {sun.shape[1]} samples in {time.time() - t:.1f} s")

    q = np.clip(np.round((sky - SKY_LO) * SKY_SCALE), 0, 255).astype(np.uint8)
    (OUT / f"{sid}.sky.bin").write_bytes(q.tobytes())

    # --- 4. sanity checks ---
    c = (E_N * E_N) // 2
    ref = 100 * float(np.mean(s["sunVis"]))
    ref_e = 100 * float(np.mean(s["earthVis"]))
    rel = ground - ground[c]
    hi, lo = rel >= np.percentile(rel, 80), rel <= np.percentile(rel, 20)
    best = int(np.argmax(sun_pct))
    checks = {
        "centreSunPct": round(float(sun_pct[c]), 2),
        "sitesJsonSunPct": round(ref, 2),
        "centreEarthPct": round(float(earth_pct[c]), 2),
        "sitesJsonEarthPct": round(ref_e, 2),
        "sunPctHighestFifth": round(float(sun_pct[hi].mean()), 1),
        "sunPctLowestFifth": round(float(sun_pct[lo].mean()), 1),
        "sunnyHeightCorrelation": round(float(np.corrcoef(rel, sun_pct)[0, 1]), 2),
        "sunniestPoint": {"east_m": float(ee[best]), "north_m": float(en[best]), "sunPct": round(float(sun_pct[best]), 1),
                          "height_m": round(float(rel[best]), 0)},
    }
    print(f"  centre sun {sun_pct[c]:.2f}% vs sites.json {ref:.2f}% (diff {sun_pct[c] - ref:+.2f}); "
          f"earth {earth_pct[c]:.2f}% vs {ref_e:.2f}%")
    print(f"  grid sun {sun_pct.min():.1f} .. {sun_pct.max():.1f}%; highest fifth {checks['sunPctHighestFifth']}% "
          f"vs lowest fifth {checks['sunPctLowestFifth']}% (corr {checks['sunnyHeightCorrelation']})")
    print(f"  sunniest point {ee[best]:+.0f} m E, {en[best]:+.0f} m N: {sun_pct[best]:.1f}% at {rel[best]:+.0f} m")

    fine = min(pixel_size_m(HERE / d["path"]) for d in dems)
    labels = [l for l, _ in used]
    meta = {
        "id": sid,
        "name": site["name"],
        "available": True,
        "coarse": False,
        "terrain": {
            "file": f"{sid}.bin",
            "format": "float32le",
            "size": T_SIZE,
            "spacing_m": T_SPACING,
            "extent_m": (T_SIZE - 1) * T_SPACING,
            "minHeight_m": round(float(z.min()), 1),
            "maxHeight_m": round(float(z.max()), 1),
            "source": " + ".join(labels),
            "resolution": ((f"5 m DEM box-averaged to {T_SPACING:.0f} m" if fine <= 5.5 else
                            f"{T_SPACING:.0f} m LOLA mosaic, no 5 m site DEM")
                           + "; features smaller than ~40 m are not shown."),
            "layout": "row-major, row 0 = north edge, column 0 = west edge; axes = the site's local east/north",
            "heights": "metres relative to the landing point's ground, from the site's tangent plane (curvature included)",
        },
        "exposure": {
            "spacing_m": E_SPACING,
            "n": E_N,
            "extent_m": (E_N - 1) * E_SPACING,
            "observer_m": OBSERVER_H,
            "period": {"start": DATASET_META["start"], "stepHours": DATASET_META["stepHours"], "count": int(sun.shape[1])},
            "rule": "body centre above the point's own skyline (local + wide DEM), same as sites.json",
            "directions": ("All points use the landing site's JPL Horizons Sun/Earth az/el. Within 1.5 km the true "
                           "directions differ by < 0.1 deg; skylines are binned in the site's azimuth frame and "
                           "elevation is corrected for the tilt of the local vertical (<= 0.05 deg)."),
            "skylineFile": f"{sid}.sky.bin",
            "skylineFormat": f"uint8, ({E_N}*{E_N}) x 360 (point-major, same order as the grids), deg = v / {SKY_SCALE:g} {SKY_LO:+g}",
            "sunPct": np.round(sun_pct, 1).tolist(),
            "earthPct": np.round(earth_pct, 1).tolist(),
            "bothPct": np.round(both_pct, 1).tolist(),
            "height_m": np.round(rel, 1).tolist(),
        },
        "checks": checks,
    }
    (OUT / f"{sid}.json").write_text(json.dumps(meta, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"  wrote {sid}.json/.bin/.sky.bin ({(OUT / f'{sid}.bin').stat().st_size // 1024} KB terrain) "
          f"- site total {time.time() - t_site:.1f} s")
    return meta


DATASET_META = {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma-separated site ids")
    args = ap.parse_args()

    ds = json.loads((DATA / "sites.json").read_text(encoding="utf-8"))
    DATASET_META.update(ds["meta"])
    cfg = json.loads((HERE / "dems.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    for site in ds["sites"]:
        if args.only and site["id"] not in args.only.split(","):
            continue
        dems = cfg.get(site["id"], [])
        fine = min((pixel_size_m(HERE / d["path"]) for d in dems), default=None)
        if fine is None or fine > 20.5:
            reason = ("No terrain model for this site (smooth-sphere horizon)." if fine is None else
                      f"Only a {fine:.0f} m DEM covers this site: too coarse for a close-up.")
            print(f"[{site['name']}] skipped: {reason}")
            (OUT / f"{site['id']}.json").write_text(json.dumps(
                {"id": site["id"], "name": site["name"], "available": False, "coarse": True, "reason": reason},
                ensure_ascii=False), encoding="utf-8")
            continue
        build_site(site, dems)
    print(f"all sites in {time.time() - t0:.1f} s")


if __name__ == "__main__":
    main()
