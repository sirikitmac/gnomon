"""Shared geometry helpers for the visibility engine.

az/el convention: azimuth in degrees clockwise from local north (0 = N, 90 = E),
elevation in degrees above the flat (ellipsoid) horizon. The terrain skyline
uses the same convention, binned at 1 degree of azimuth.
"""
import math


def local_az_el(site_lat, site_lon, body_lat, body_lon):
    """Az/el of a distant body whose sub-point on the Moon is (body_lat, body_lon)."""
    p, d = math.radians(site_lat), math.radians(body_lat)
    dl = math.radians(body_lon - site_lon)
    el = math.asin(math.sin(p) * math.sin(d) + math.cos(p) * math.cos(d) * math.cos(dl))
    az = math.atan2(math.sin(dl) * math.cos(d),
                    math.cos(p) * math.sin(d) - math.sin(p) * math.cos(d) * math.cos(dl))
    return (math.degrees(az) % 360.0, math.degrees(el))


def visible(az, el, skyline):
    """True when the body centre sits above the terrain skyline at its azimuth."""
    return el > skyline[int(round(az)) % 360]
