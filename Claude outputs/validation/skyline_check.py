"""Independent skyline: great-circle rays, exact 3D sphere geometry, bilinear heights.
Near window (<=12 km) at full DEM resolution; far window (to 150 km) read at 4x decimation
with max-resampling so no peak is lost. Observer 2 m above the DEM height at the site."""
import json, sys, math, numpy as np, rasterio
from rasterio.enums import Resampling
from rasterio.windows import from_bounds
from pyproj import CRS, Transformer, Geod

R = 1737400.0
geod = Geod(a=R, b=R)

def bilinear(arr, c, r):
    c0 = np.floor(c).astype(int); r0 = np.floor(r).astype(int)
    ok = (c0 >= 0) & (r0 >= 0) & (c0 < arr.shape[1] - 1) & (r0 < arr.shape[0] - 1)
    out = np.full(c.shape, np.nan)
    c0, r0, fc, fr = c0[ok], r0[ok], (c - np.floor(c))[ok], (r - np.floor(r))[ok]
    v = (arr[r0, c0] * (1 - fc) * (1 - fr) + arr[r0, c0 + 1] * fc * (1 - fr) + arr[r0 + 1, c0] * (1 - fc) * fr + arr[r0 + 1, c0 + 1] * fc * fr)
    out[ok] = v
    return out

def load(path, lat, lon, reach_m, decim):
    ds = rasterio.open(path)
    crs = CRS.from_wkt(ds.crs.to_wkt())
    fwd = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
    x0, y0 = fwd.transform(lon, lat)
    b = (x0 - reach_m * 1.05, y0 - reach_m * 1.05, x0 + reach_m * 1.05, y0 + reach_m * 1.05)
    win = from_bounds(*b, transform=ds.transform).round_offsets().round_lengths()
    win = win.intersection(rasterio.windows.Window(0, 0, ds.width, ds.height))
    W, H = int(win.width) // decim * decim, int(win.height) // decim * decim
    win = rasterio.windows.Window(win.col_off, win.row_off, W, H)
    if decim == 1:
        arr = ds.read(1, window=win, masked=True).astype('float32').filled(np.nan)
    else:  # max-pool in strips so a 150 km window fits in memory and no peak is lost
        arr = np.empty((H // decim, W // decim), 'float32')
        strip = decim * 256
        for r in range(0, H, strip):
            h = min(strip, H - r)
            blk = ds.read(1, window=rasterio.windows.Window(win.col_off, win.row_off + r, W, h), masked=True).astype('float32').filled(np.nan)
            arr[r // decim:(r + h) // decim] = np.nanmax(blk.reshape(h // decim, decim, W // decim, decim), axis=(1, 3))
    wt = ds.window_transform(win) * rasterio.Affine.scale(decim)
    return arr, ~wt, fwd, abs(wt.a)

def skyline(path, lat, lon, max_km, h_site=None):
    near = load(path, lat, lon, min(12000, max_km * 1000), 1)
    far = load(path, lat, lon, max_km * 1000, 4) if max_km > 12 else None
    arr, inv, fwd, px = near
    x0, y0 = fwd.transform(lon, lat)
    c0, r0 = inv * (x0, y0)
    # The lander stands on the map pixel it is in (a DEM cannot resolve the ground closer than a pixel).
    h0 = float(arr[int(math.floor(r0)), int(math.floor(c0))]) if h_site is None else h_site
    hobs = h0 + 2.0
    la, lo = math.radians(lat), math.radians(lon)
    u0 = np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
    sky = np.full(360, -90.0)
    near_m = min(12000, max_km * 1000)
    for part, dmin, dmax in ((near, 0, near_m), (far, near_m, max_km * 1000) if far else (None, 0, 0)):
        if part is None: continue
        a, iv, f, p = part
        # near: full resolution from one pixel out; far: max-pooled cells only beyond the near zone
        d = np.arange(max(p, dmin), dmax, p / 2)
        for az in range(360):
            lon2, lat2, _ = geod.fwd(np.full(d.shape, lon), np.full(d.shape, lat), np.full(d.shape, float(az)), d)
            x, y = f.transform(lon2, lat2)
            c, r = iv * (np.asarray(x), np.asarray(y))
            h = bilinear(a, np.asarray(c), np.asarray(r))
            g = ~np.isnan(h)
            if not g.any(): continue
            L2, O2 = np.radians(lat2[g]), np.radians(lon2[g])
            u = np.stack([np.cos(L2) * np.cos(O2), np.cos(L2) * np.sin(O2), np.sin(L2)], 1)
            P = (R + h[g])[:, None] * u - (R + hobs) * u0
            el = np.degrees(np.arcsin((P @ u0) / np.linalg.norm(P, axis=1)))
            sky[az] = max(sky[az], el.max())
    return sky, h0

site_id = sys.argv[1]
base = '/'.join(__file__.split('/')[:-1])
P = sys.argv[2]
sites = {s['id']: s for s in json.load(open(P + '/sites.json'))['sites']}
dems = json.load(open(P + '/dems.json'))[site_id]
s = sites[site_id]
out = []
h_site = None
for dm in dems:
    km = dm.get('maxRangeKm') or 999
    if 'maxRangeKm' not in dm:  # 5 m tile: whole tile
        ds = rasterio.open(P + '/' + dm['path']); km = abs(ds.transform.a) * max(ds.width, ds.height) / 1000
    sk, h0 = skyline(P + '/' + dm['path'], s['lat'], s['lonEast'], km, h_site)
    pass  # each DEM measured from its own ground height at the site (DEMs differ by metres)
    out.append(sk)
    print(dm['label'], 'site height', round(h0, 1), file=sys.stderr)
sky = np.maximum.reduce(out)
json.dump({'id': site_id, 'skyline': np.round(sky, 3).tolist()}, open(f'{base}/sky_{site_id}.json', 'w'))
print(site_id, 'done')
