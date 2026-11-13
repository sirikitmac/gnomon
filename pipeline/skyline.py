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


class DemWindow:
    """One DEM window read once, for many skyline queries around a site (vectorized).

    Points are given as ground offsets (east, north) in metres in the SITE's local
    frame, so every point's skyline is binned in the site's azimuths and the site's
    Sun/Earth azimuths apply to it directly (no meridian-convergence correction needed).
    Far samples come from max-pooled copies of the DEM (pixel ~ radial step), so the
    step can grow with distance without stepping over peaks.
    """

    def __init__(self, path, lat, lon_east, reach_m, levels=6):
        with rasterio.open(path) as ds:
            tf = _to_map(ds)
            (self.x0, self.y0), self.n, self.e, self.k = _local_frame(tf, lat, lon_east)
            self.px = abs(ds.transform.a)
            c0, r0 = ~ds.transform * (self.x0, self.y0)
            if not (0 <= r0 < ds.height and 0 <= c0 < ds.width):
                raise ValueError(f"site {lat},{lon_east} is outside {path}")
            reach = int(math.ceil(reach_m * self.k / self.px)) + 2
            col_off, row_off = max(0, int(c0) - reach), max(0, int(r0) - reach)
            win = Window(col_off, row_off,
                         min(ds.width, int(c0) + reach + 1) - col_off,
                         min(ds.height, int(r0) + reach + 1) - row_off)
            self.dem = ds.read(1, window=win, masked=True).astype("float32").filled(np.nan)
            self.inv = ~ds.window_transform(win)
        self.reach_m = reach_m
        # Max-pooled pyramid; nodata is -1e30 so it never wins a max (gives a ~-90° angle).
        lv = np.where(np.isnan(self.dem), np.float32(-1e30), self.dem)
        self.pyr = []
        for _ in range(levels):
            p = lv.copy()
            p[0, :] = p[-1, :] = p[:, 0] = p[:, -1] = -1e30  # clipped (outside) samples land here
            self.pyr.append(p)
            H, W = (lv.shape[0] // 2) * 2, (lv.shape[1] // 2) * 2
            if H < 8 or W < 8:
                break
            lv = lv[:H, :W].reshape(H // 2, 2, W // 2, 2).max(axis=(1, 3))

    def to_pixel(self, east, north):
        """Ground offsets (m) from the site -> fractional (col, row) in the window."""
        east, north = np.asarray(east, "float64"), np.asarray(north, "float64")
        x = self.x0 + self.k * (east * self.e[0] + north * self.n[0])
        y = self.y0 + self.k * (east * self.e[1] + north * self.n[1])
        c, r = self.inv * (x, y)
        return np.asarray(c), np.asarray(r)

    def height_floor(self, east, north):
        """DEM height of the pixel containing each point (same rule as skyline_from_dem); NaN outside."""
        c, r = self.to_pixel(east, north)
        c, r = np.floor(c).astype(np.int64), np.floor(r).astype(np.int64)
        H, W = self.dem.shape
        ok = (r >= 0) & (r < H) & (c >= 0) & (c < W)
        out = np.full(c.shape, np.nan, "float64")
        out[ok] = self.dem[r[ok], c[ok]]
        return out

    def height_bilinear(self, east, north, box_px=1):
        """Bilinear DEM height, optionally on a box-filtered DEM (box_px x box_px) to avoid aliasing."""
        dem = self.dem
        if box_px > 1:
            valid = ~np.isnan(dem)
            z = np.where(valid, dem, 0).astype("float64")
            b, pad = box_px, box_px // 2
            S = np.pad(z, ((pad + 1, b - pad), (pad + 1, b - pad))).cumsum(0).cumsum(1)
            V = np.pad(valid.astype("float64"), ((pad + 1, b - pad), (pad + 1, b - pad))).cumsum(0).cumsum(1)

            def box(A):
                return (A[b:, b:] - A[:-b, b:] - A[b:, :-b] + A[:-b, :-b])[:dem.shape[0], :dem.shape[1]]

            s, v = box(S), box(V)
            dem = np.where(v > b * b - 0.5, s / np.maximum(v, 1), np.nan)
        c, r = self.to_pixel(east, north)
        c, r = c - 0.5, r - 0.5  # pixel centres
        c0, r0 = np.floor(c).astype(np.int64), np.floor(r).astype(np.int64)
        fc, fr = c - c0, r - r0
        H, W = dem.shape
        ok = (r0 >= 0) & (r0 + 1 < H) & (c0 >= 0) & (c0 + 1 < W)
        out = np.full(c.shape, np.nan, "float64")
        r0, c0, fr, fc = r0[ok], c0[ok], fr[ok], fc[ok]
        out[ok] = (dem[r0, c0] * (1 - fr) * (1 - fc) + dem[r0, c0 + 1] * (1 - fr) * fc
                   + dem[r0 + 1, c0] * fr * (1 - fc) + dem[r0 + 1, c0 + 1] * fr * fc)
        return out

    def skylines(self, east, north, max_range_m=None, observer_h=2.0, rate=0.004, workers=8, min_range_m=0.0):
        """Skylines (N, 360) for N points, same angle rule as skyline_from_dem.

        Radial step is one pixel out to px/rate, then grows as rate x distance; each
        sample reads the pyramid level whose pixel matches the step. Terrain closer than
        min_range_m is ignored (for a "distant terrain only" skyline). Returns
        (skylines, ground heights); points on nodata get -90 everywhere and NaN height.
        """
        from concurrent.futures import ThreadPoolExecutor

        if max_range_m is None:
            max_range_m = self.reach_m
        gpx = self.px / self.k  # ground metres per pixel
        d, steps = [gpx], []
        while d[-1] < max_range_m:
            st = max(gpx, rate * d[-1])
            steps.append(st)
            d.append(d[-1] + st)
        d, steps = np.array(d[:-1]), np.array(steps)
        far = d >= min_range_m
        d, steps = d[far], steps[far]
        lvl =np.clip(np.floor(np.log2(steps / gpx + 1e-9)).astype(int), 0, len(self.pyr) - 1)

        az = np.radians(np.arange(360))
        dmap = d * self.k
        vx = np.cos(az)[:, None] * self.n[0] + np.sin(az)[:, None] * self.e[0]
        vy = np.cos(az)[:, None] * self.n[1] + np.sin(az)[:, None] * self.e[1]
        A = self.inv  # its linear part turns map displacements into window pixels
        dc = (A.a * vx + A.b * vy) * dmap[None, :]
        dr = (A.d * vx + A.e * vy) * dmap[None, :]
        groups = []
        for L in np.unique(lvl):
            m, s = lvl == L, 2.0 ** L
            groups.append((self.pyr[L], (dc[:, m] / s).astype("float32"), (dr[:, m] / s).astype("float32"),
                           (1.0 / d[m]).astype("float32"), (d[m] / (2 * MOON_R)).astype("float32"), s))

        c_o, r_o = self.to_pixel(east, north)
        c_o, r_o = np.atleast_1d(c_o), np.atleast_1d(r_o)
        ground = np.atleast_1d(self.height_floor(east, north))

        def one(i):
            if np.isnan(ground[i]):
                return np.full(360, -90.0)
            h0 = np.float32(ground[i] + observer_h)
            best = np.full(360, -np.inf, "float32")
            for P, gdc, gdr, invd, curv, s in groups:
                H, W = P.shape
                cc = np.clip(np.floor(gdc + np.float32(c_o[i] / s)).astype(np.int32), 0, W - 1)
                rr = np.clip(np.floor(gdr + np.float32(r_o[i] / s)).astype(np.int32), 0, H - 1)
                t = (P.ravel()[rr * W + cc] - h0) * invd - curv
                np.maximum(best, t.max(axis=1), out=best)
            return np.degrees(np.arctan(best.astype("float64")))

        with ThreadPoolExecutor(workers) as ex:
            out = list(ex.map(one, range(len(c_o))))
        return np.array(out), ground
