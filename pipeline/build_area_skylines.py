"""
C3 landing-area data: a full 360-degree skyline for every point of each site's 31 x 31 grid
(100 m spacing, +/-1500 m), so the app can give a verdict across the whole landing area.

Inputs (already published with the app, built from NASA LRO LOLA / PGDA terrain):
  app/public/data/terrain/<id>.bin      301 x 301 heights, 20 m spacing, curvature included
  app/public/data/terrain/<id>.sky.bin  (31*31) x 360 distant skyline (>= 1500 m), uint8 deg = v/10 - 5
Near skyline (< 1500 m) is ray-marched over the 20 m heights from 2 m above each point (same
observer height as the pipeline); the full skyline is max(near, distant).
Output: app/public/data/terrain/<id>.area.bin, same uint8 encoding and layout as .sky.bin.
Check: per-point sunlight over Nov 2026-Dec 2028 vs the pipeline's own exposure.sunPct grid.
"""
import json, pathlib, numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
TER = ROOT / 'app/public/data/terrain'
OBS = 2.0

def build(site_id, ds_site):
    meta = json.loads((TER / f'{site_id}.json').read_text())
    t, ex = meta['terrain'], meta['exposure']
    size, dx, half = t['size'], t['spacing_m'], t['extent_m'] / 2
    H = np.fromfile(TER / t['file'], dtype='<f4').reshape(size, size)
    n, sp = ex['n'], ex['spacing_m']
    far = np.fromfile(TER / ex['skylineFile'], dtype=np.uint8).reshape(n * n, 360).astype(np.float32) / 10 - 5
    # grid points, row-major, row 0 = north
    off = (np.arange(n) - (n - 1) / 2) * sp
    north = -off[:, None].repeat(n, 1)      # row 0 = +1500 m north
    east = off[None, :].repeat(n, 0)
    e, nn = east.ravel(), north.ravel()

    def height(ee, no):  # bilinear on the 20 m grid; col 0 = west, row 0 = north
        c = (ee + half) / dx; r = (half - no) / dx
        c = np.clip(c, 0, size - 1.001); r = np.clip(r, 0, size - 1.001)
        c0 = np.floor(c).astype(int); r0 = np.floor(r).astype(int); fc = c - c0; fr = r - r0
        return (H[r0, c0] * (1 - fc) * (1 - fr) + H[r0, c0 + 1] * fc * (1 - fr) + H[r0 + 1, c0] * (1 - fc) * fr + H[r0 + 1, c0 + 1] * fc * fr)

    h0 = height(e, nn) + OBS
    az = np.radians(np.arange(360))
    dists = np.arange(dx, ex['skylineMinRange_m'] + 1e-6, dx / 2)   # 10 m steps out to 1500 m
    near = np.full((n * n, 360), -90.0, dtype=np.float32)
    for d in dists:
        qe = e[:, None] + d * np.sin(az)[None, :]
        qn = nn[:, None] + d * np.cos(az)[None, :]
        ang = np.degrees(np.arctan2(height(qe, qn) - h0[:, None], d))
        np.maximum(near, ang, out=near)
    full = np.maximum(near, far)
    enc = np.clip(np.round((full + 5) * 10), 0, 255).astype(np.uint8)
    enc.tofile(TER / f'{site_id}.area.bin')

    # check against the pipeline's per-point sunlight (body centre above the point's skyline)
    se = ds_site['series']; sunAz = np.array(se['sunAz']); sunEl = np.array(se['sunEl'])
    dec = enc.astype(np.float32) / 10 - 5
    a = np.mod(sunAz, 360); i0 = np.floor(a).astype(int) % 360; f = a - np.floor(a)
    sky_t = dec[:, i0] * (1 - f) + dec[:, (i0 + 1) % 360] * f
    ours = 100 * (sunEl[None, :] > sky_t).mean(1)
    ref = np.array(ex['sunPct'])
    centre = (n * n) // 2
    d = ours - ref
    return {'id': site_id, 'points': n * n, 'meanAbsDiff': round(float(np.abs(d).mean()), 2), 'p90AbsDiff': round(float(np.percentile(np.abs(d), 90)), 2),
            'maxAbsDiff': round(float(np.abs(d).max()), 2), 'corr': round(float(np.corrcoef(ours, ref)[0, 1]), 4),
            'centreOurs': round(float(ours[centre]), 1), 'centrePipeline': round(float(ref[centre]), 1), 'centreSitesJson': round(100 * float(np.mean(se['sunVis'])), 1),
            'maxSkyDeg': round(float(full.max()), 1)}

def main():
    ds = json.loads((ROOT / 'app/public/data/sites.json').read_text())
    by = {s['id']: s for s in ds['sites']}
    out = []
    for p in sorted(TER.glob('*.json')):
        m = json.loads(p.read_text())
        if not m.get('available') or not m.get('exposure'):
            continue
        r = build(m['id'], by[m['id']]); out.append(r); print(r)
    (ROOT / 'pipeline/validation/area_skyline_check.json').write_text(json.dumps(out, indent=1))

if __name__ == '__main__':
    main()
