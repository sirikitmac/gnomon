"""Build a 360° terrain skyline (horizon elevation per degree of azimuth) from LOLA DEMs.

Works with GeoTIFFs in polar stereographic metres, like the PGDA south pole site
DEMs (5 m) and the wider LOLA polar mosaics (20 m / 60 m). Lunar curvature is
included, so a peak can have a horizon below 0°.

Only a window around the site is read, so multi-GB polar mosaics fit in memory.
"""
import math

import numpy as np
import rasterio
from pyproj import CRS, Transformer
from rasterio.windows import Window

MOON_R = 1737400.0


def _to_map(ds):
    """lon/lat (degrees, the raster's own lunar datum) -> raster map coordinates."""
    crs = CRS.from_wkt(ds.crs.to_wkt())
    return Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)


def _local_frame(tf, lat, lon):
    """Site position in map metres, unit vectors of local north/east in the map
    plane, and the map scale factor k (map metres per ground metre) at the site."""
    dlat = 0.001  # degrees
    x0, y0 = tf.transform(lon, lat)
    xn, yn = tf.transform(lon, lat + dlat)
    xe, ye = tf.transform(lon + dlat / math.cos(math.radians(lat)), lat)
    n = np.array([xn - x0, yn - y0])
    e = np.array([xe - x0, ye - y0])
    ground = math.radians(dlat) * MOON_R
    k = np.linalg.norm(n) / ground
    return (x0, y0), n / np.linalg.norm(n), e / np.linalg.norm(e), k


def site_height(path, lat, lon_east):
    """DEM height (m) at the site, or NaN if outside / nodata."""
    with rasterio.open(path) as ds:
        tf = _to_map(ds)
        x0, y0 = tf.transform(lon_east, lat)
        c, r = ~ds.transform * (x0, y0)
        if not (0 <= r < ds.height and 0 <= c < ds.width):
            return float("nan")
        v = ds.read(1, window=Window(int(c), int(r), 1, 1), masked=True)
        return float("nan") if np.ma.is_masked(v) or np.isnan(v[0, 0]) else float(v[0, 0])


def skyline_from_dem(path, lat, lon_east, max_range_m=None, observer_h=2.0, step_px=1.0):
    with rasterio.open(path) as ds:
        # Use the raster's own geographic CRS so there is no datum mismatch
        # between a hand-built lunar sphere and the file's.
        tf = _to_map(ds)
        (x0, y0), n, e, k = _local_frame(tf, lat, lon_east)
        px = abs(ds.transform.a)
        c0, r0 = ~ds.transform * (x0, y0)
        if not (0 <= r0 < ds.height and 0 <= c0 < ds.width):
            raise ValueError(f"site {lat},{lon_east} is outside {path}")

        if max_range_m is None:
            max_range_m = px * max(ds.width, ds.height)
        reach = int(math.ceil(max_range_m * k / px)) + 2
        col_off, row_off = max(0, int(c0) - reach), max(0, int(r0) - reach)
        win = Window(col_off, row_off,
                     min(ds.width, int(c0) + reach + 1) - col_off,
                     min(ds.height, int(r0) + reach + 1) - row_off)
        dem = ds.read(1, window=win, masked=True).astype("float32").filled(np.nan)
        inv = ~ds.window_transform(win)
        H, W = dem.shape

        c0w, r0w = inv * (x0, y0)
        z0 = dem[int(math.floor(r0w)), int(math.floor(c0w))]
        if np.isnan(z0):
            raise ValueError(f"site {lat},{lon_east} falls on nodata in {path}")
        h0 = float(z0) + observer_h

        # Step in map metres, convert to ground metres with the scale factor.
        map_d = np.arange(px * step_px, max_range_m * k, px * step_px)
        dists = map_d / k
        sky = np.full(360, -90.0)
        for az in range(360):
            a = math.radians(az)
            d_vec = math.cos(a) * n + math.sin(a) * e
            xs, ys = x0 + d_vec[0] * map_d, y0 + d_vec[1] * map_d
            cols, rows = inv * (xs, ys)
            cols = np.floor(np.asarray(cols)).astype(np.int64)
            rows = np.floor(np.asarray(rows)).astype(np.int64)
            ok = (rows >= 0) & (rows < H) & (cols >= 0) & (cols < W)
            if not ok.any():
                continue
            h = dem[rows[ok], cols[ok]].astype("float64")
            d = dists[ok]
            good = ~np.isnan(h)
            if not good.any():
                continue
            # angle above the observer's flat horizon, with the surface dropping by d²/2R
            ang = np.degrees(np.arctan((h[good] - h0) / d[good] - d[good] / (2 * MOON_R)))
            sky[az] = ang.max()
    return sky


def combine(*skylines):
    """Max over skylines from several DEMs (e.g. local 5 m + wide 20 m)."""
    return np.maximum.reduce([np.asarray(s) for s in skylines])


def smooth_horizon(observer_h=2.0):
    """No-terrain fallback: horizon dip of a smooth sphere seen from observer_h metres."""
    dip = -math.degrees(math.acos(MOON_R / (MOON_R + observer_h)))
    return np.full(360, dip)
