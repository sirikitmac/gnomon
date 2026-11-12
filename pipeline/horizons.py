"""Fetch hourly Sun and Earth az/el for a lunar surface site from JPL Horizons.

No API key needed. Docs: https://ssd-api.jpl.nasa.gov/doc/horizons.html
Horizons elevations are against the flat (ellipsoid) horizon; terrain is applied later.
"""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
BODIES = {"sun": "10", "earth": "399"}


def q(v):
    return f"'{v}'"  # Horizons wants quoted values


def fetch(body_id, lat, lon_east, start, stop, step="1h", alt_km=0.0):
    params = {
        "format": "json",
        "COMMAND": q(body_id),
        "OBJ_DATA": q("NO"),
        "MAKE_EPHEM": q("YES"),
        "EPHEM_TYPE": q("OBSERVER"),
        "CENTER": q("coord@301"),
        "COORD_TYPE": q("GEODETIC"),
        "SITE_COORD": q(f"{lon_east},{lat},{alt_km}"),
        "START_TIME": q(start),
        "STOP_TIME": q(stop),
        "STEP_SIZE": q(step),
        "QUANTITIES": q("4"),  # apparent azimuth & elevation
        "ANG_FORMAT": q("DEG"),
        "CSV_FORMAT": q("YES"),
        "TIME_DIGITS": q("MINUTES"),
    }
    url = API + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=120) as r:
        payload = json.loads(r.read().decode("utf-8"))
    if "error" in payload:
        raise RuntimeError(payload["error"])
    return payload["result"]


def parse(result_text):
    """Return list of (time_str, az, el) from the text between $$SOE and $$EOE."""
    if "$$SOE" not in result_text:
        raise ValueError("No $$SOE marker in Horizons output:\n" + result_text[:1500])
    body = result_text.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    rows = []
    for line in body.strip().splitlines():
        parts = [p.strip() for p in line.split(",")]
        nums = []
        for p in parts[1:]:
            try:
                nums.append(float(p))
            except ValueError:
                pass  # skip empty columns and solar/lunar presence flags
        if len(nums) >= 2:
            rows.append((parts[0], nums[0], nums[1]))
    return rows


def fetch_site(site, start, stop, step, cache_dir: Path):
    """Fetch (or load cached) Sun and Earth series for one site."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    out = {}
    for name, bid in BODIES.items():
        f = cache_dir / f"horizons_{site['id']}_{name}_{start}_{stop}_{step}.txt".replace(":", "")
        if f.exists():
            text = f.read_text(encoding="utf-8")
        else:
            print(f"  Horizons: {site['name']} / {name} ...")
            text = fetch(bid, site["lat"], site["lonEast"], start, stop, step)
            f.write_text(text, encoding="utf-8")
            time.sleep(1.0)  # be polite to the API
        out[name] = parse(text)
    return out


if __name__ == "__main__":
    sample = """header\n$$SOE\n 2026-Dec-01 00:00, , , 123.456789, -1.234567,\n 2026-Dec-01 01:00,*,m, 124.000000, -1.100000,\n$$EOE\nfooter"""
    print(parse(sample))
