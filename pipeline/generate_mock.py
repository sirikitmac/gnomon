"""Generate MOCK site data in the app's JSON format, with no network and no NASA files.

Sun and Earth positions come from a simplified spherical model (mean synodic
rotation, approximate libration), and skylines are synthetic. The shape of the
output matches what build_dataset.py writes from real NASA data, so the
frontend can be built against it. Do not present these numbers as real results.

Usage:
  python generate_mock.py            ->  ../app/public/data/sites.mock.json (safe default)
  python generate_mock.py --replace  ->  overwrite ../app/public/data/sites.json (destroys real data!)
"""
import argparse
import json
import math
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

from geometry import local_az_el, visible

HERE = Path(__file__).parent
DATA_DIR = HERE.parent / "app" / "public" / "data"

START = datetime(2026, 12, 1, tzinfo=timezone.utc)
DAYS = 90
STEP_H = 1

NEW_MOON_EPOCH = datetime(2000, 1, 6, 18, 14, tzinfo=timezone.utc)
SYNODIC = 29.530589
ANOMALISTIC = 27.554550
DRACONIC = 27.212221
ECLIPSE_YEAR = 346.620


def days_since(t):
    return (t - NEW_MOON_EPOCH).total_seconds() / 86400.0


def sub_solar(t):
    d = days_since(t)
    lon = (180.0 - 360.0 * (d % SYNODIC) / SYNODIC)  # ~180 at new moon from the far side view
    lat = 1.54 * math.sin(2 * math.pi * d / ECLIPSE_YEAR)
    return lat, ((lon + 180) % 360) - 180


def sub_earth(t):
    d = days_since(t)
    lon = 7.9 * math.sin(2 * math.pi * d / ANOMALISTIC)
    lat = 6.7 * math.sin(2 * math.pi * (d + 5.0) / DRACONIC)
    return lat, lon


def synthetic_skyline(kind, seed):
    rng = random.Random(seed)
    waves = [(rng.uniform(0.3, 1.0), rng.randint(1, 7), rng.uniform(0, 2 * math.pi)) for _ in range(6)]
    base, amp = {
        "ridge": (-0.8, 0.45),
        "massif": (-1.0, 0.5),
        "plateau": (-0.2, 0.7),
        "crater-edge": (0.0, 0.8),
        "plain": (0.2, 0.4),
    }[kind]
    sky = []
    for a in range(360):
        r = math.radians(a)
        v = base + amp * sum(w * math.sin(k * r + ph) for w, k, ph in waves) / len(waves) * 2
        if kind == "crater-edge":  # tall crater wall across one sector
            v += 4.0 * math.exp(-((((a - 200 + 180) % 360) - 180) / 45.0) ** 2)
        if kind == "plateau":
            v += 1.6 * math.exp(-((((a - 120 + 180) % 360) - 180) / 30.0) ** 2)
        sky.append(round(v, 2))
    return sky


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--replace", action="store_true", help="overwrite the real sites.json with mock data")
    args = ap.parse_args()
    OUT = DATA_DIR / ("sites.json" if args.replace else "sites.mock.json")
    sites = json.loads((HERE / "sites.json").read_text(encoding="utf-8"))["sites"]
    times = [START + timedelta(hours=h) for h in range(0, DAYS * 24, STEP_H)]
    out_sites = []
    for i, s in enumerate(sites):
        kind = s["terrain"].split(":")[1]
        sky = synthetic_skyline(kind, seed=1000 + i)
        cols = {k: [] for k in ("sunAz", "sunEl", "earthAz", "earthEl", "sunVis", "earthVis")}
        for t in times:
            saz, sel = local_az_el(s["lat"], s["lonEast"], *sub_solar(t))
            eaz, eel = local_az_el(s["lat"], s["lonEast"], *sub_earth(t))
            cols["sunAz"].append(round(saz, 2)); cols["sunEl"].append(round(sel, 2))
            cols["earthAz"].append(round(eaz, 2)); cols["earthEl"].append(round(eel, 2))
            cols["sunVis"].append(int(visible(saz, sel, sky)))
            cols["earthVis"].append(int(visible(eaz, eel, sky)))
        out_sites.append({
            **{k: s[k] for k in ("id", "name", "lat", "lonEast", "role", "story", "source")},
            "terrain": "synthetic (mock)",
            "confidence": "mock",
            "skyline": sky,
            "series": cols,
        })
    data = {
        "meta": {
            "mock": True,
            "generatedBy": "pipeline/generate_mock.py",
            "start": START.isoformat().replace("+00:00", "Z"),
            "stepHours": STEP_H,
            "count": len(times),
            "notes": "Simplified geometry and synthetic terrain. Replace with build_dataset.py output.",
        },
        "sites": out_sites,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB, {len(out_sites)} sites, {len(times)} steps)")
    for s in out_sites:
        sv, ev = s["series"]["sunVis"], s["series"]["earthVis"]
        both = sum(a and b for a, b in zip(sv, ev))
        print(f"  {s['name']:<32} sun {100*sum(sv)/len(sv):5.1f}%  earth {100*sum(ev)/len(ev):5.1f}%  both {100*both/len(sv):5.1f}%")


if __name__ == "__main__":
    main()
