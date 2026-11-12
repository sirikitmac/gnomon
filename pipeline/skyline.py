"""Build a 360° terrain skyline (horizon elevation per degree of azimuth) from LOLA DEMs.

Works with GeoTIFFs in polar stereographic metres, like the PGDA south pole site
DEMs (5 m) and the wider LOLA polar mosaics (20 m / 60 m). Lunar curvature is
included, so a peak can have a horizon below 0°.
"""
import math

import numpy as np
import rasterio
from pyproj import CRS, Transformer

MOON_R = 1737400.0
MOON_GEOG = CRS.from_proj4(f"+proj=longlat +R={MOON_R} +no_defs")


def _north_east(tf, lat, lon):
    """Unit vectors of local north and east in the map plane."""
    x0, y0 = tf.transform(lon, lat)
    xn, yn = tf.transform(lon, lat + 0.01)
    n = np.array([xn - x0, yn - y0])
    n /= np.linalg.norm(n)
    e = np.array([n[1], -n[0]])  # rotate north 90° clockwise in a y-up plane
    return (x0, y0), n, e


def skyline_from_dem(path, lat, lon_east, max_range_m=None, observer_h=2.0, step_px=1.0):
    with rasterio.open(path) as ds:
        dem = ds.read(1, masked=True).astype("float64").filled(np.nan)
        tf = Transformer.from_crs(MOON_GEOG, ds.crs, always_xy=True)
        (x0, y0), n, e = _north_east(tf, lat, lon_east)
        inv = ~ds.transform
        px = abs(ds.transform.a)
        c0, r0 = inv * (x0, y0)
        if not (0 <= r0 < ds.height and 0 <= c0 < ds.width):
            raise ValueError(f"site {lat},{lon_east} is outside {path}")
        h0 = dem[int(r0), int(c0)] + observer_h
        if max_range_m is None:
            max_range_m = px * max(ds.width, ds.height)
        dists = np.arange(px * step_px, max_range_m, px * step_px)
        sky = np.full(360, -90.0)
        for az in range(360):
            a = math.radians(az)
            d_vec = math.cos(a) * n + math.sin(a) * e
            xs, ys = x0 + d_vec[0] * dists, y0 + d_vec[1] * dists
            cols, rows = inv * (xs, ys)
            cols, rows = np.asarray(cols).astype(int), np.asarray(rows).astype(int)
            ok = (rows >= 0) & (rows < ds.height) & (cols >= 0) & (cols < ds.width)
            if not ok.any():
                continue
            h = dem[rows[ok], cols[ok]]
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
