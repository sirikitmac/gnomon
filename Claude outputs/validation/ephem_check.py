"""Independent check of Rocky's Sun/Earth az/el (from JPL Horizons) using JPL DE421 directly.

Method: Moon-surface observer at (lat, lonEast, 0 km) on the 1737.4 km sphere.
Moon orientation: DE421 integrated librations (PA frame) -> mean-Earth (ME) frame, and the IAU 2015
rotation model as a second, independent orientation. Apparent direction = light-time corrected,
first-order stellar aberration from the observer's barycentric velocity. Az from north toward east.
"""
import json, sys, numpy as np, de421
from jplephem.ephem import Ephemeris

eph = Ephemeris(de421)
EMRAT = 81.3005690699153
C = 299792.458 * 86400  # km/day
R_MOON = 1737.4
ds = json.load(open('sites.json'))
meta = ds['meta']
n = meta['count']
t0 = np.datetime64(meta['start'].replace('Z', ''))
utc = t0 + np.arange(n) * np.timedelta64(int(meta['stepHours'] * 3600), 's')
jd_utc = 2440587.5 + (utc - np.datetime64('1970-01-01T00:00:00')).astype('timedelta64[s]').astype(float) / 86400
jd = jd_utc + 69.184 / 86400  # UTC -> TT (37 leap s + 32.184 s); TDB-TT < 2 ms, ignored

def pv(name, t):
    p, v = eph.position_and_velocity(name, t)
    return p.T, v.T  # (N,3) km, km/day

def bary(name, t):
    if name == 'sun':
        return pv('sun', t)
    emb, vemb = pv('earthmoon', t)
    m, vm = pv('moon', t)  # geocentric Moon
    e, ve = emb - m / (1 + EMRAT), vemb - vm / (1 + EMRAT)
    return (e, ve) if name == 'earth' else (e + m, ve + vm)

def Rz(a):
    c, s = np.cos(a), np.sin(a); z, o = np.zeros_like(a), np.ones_like(a)
    return np.stack([np.stack([c, s, z], -1), np.stack([-s, c, z], -1), np.stack([z, z, o], -1)], -2)
def Rx(a):
    c, s = np.cos(a), np.sin(a); z, o = np.zeros_like(a), np.ones_like(a)
    return np.stack([np.stack([o, z, z], -1), np.stack([z, c, s], -1), np.stack([z, -s, c], -1)], -2)
def Ry(a):
    c, s = np.cos(a), np.sin(a); z, o = np.zeros_like(a), np.ones_like(a)
    return np.stack([np.stack([c, z, -s], -1), np.stack([z, o, z], -1), np.stack([s, z, c], -1)], -2)

# ICRF -> PA (DE421 librations: phi, theta, psi; 3-1-3)
lib = eph.position('librations', jd).T
M_pa = Rz(lib[:, 2]) @ Rx(lib[:, 1]) @ Rz(lib[:, 0])
AS = np.pi / 180 / 3600
def me_from_pa(sign):
    a = sign * np.array([67.92, 78.56, 0.30]) * AS  # moon_080317.tf, MOON_ME_DE421 relative to MOON_PA_DE421, axes 3,2,1
    one = np.ones(1)
    return (Rx(a[2] * one) @ Ry(a[1] * one) @ Rz(a[0] * one))[0]

def iau(t):
    d = t - 2451545.0; T = d / 36525; r = np.radians
    E = [None] + [r(x) for x in (125.045 - 0.0529921*d, 250.089 - 0.1059842*d, 260.008 + 13.0120009*d, 176.625 + 13.3407154*d,
         357.529 + 0.9856003*d, 311.589 + 26.4057084*d, 134.963 + 13.0649930*d, 276.617 + 0.3287146*d, 34.226 + 1.7484877*d,
         15.134 - 0.1589763*d, 119.743 + 0.0036096*d, 239.961 + 0.1643573*d, 25.053 + 12.9590088*d)]
    s, c = np.sin, np.cos
    a0 = 269.9949 + 0.0031*T - 3.8787*s(E[1]) - 0.1204*s(E[2]) + 0.0700*s(E[3]) - 0.0172*s(E[4]) + 0.0072*s(E[6]) - 0.0052*s(E[10]) + 0.0043*s(E[13])
    d0 = 66.5392 + 0.0130*T + 1.5419*c(E[1]) + 0.0239*c(E[2]) - 0.0278*c(E[3]) + 0.0068*c(E[4]) - 0.0029*c(E[6]) + 0.0009*c(E[7]) + 0.0008*c(E[10]) - 0.0009*c(E[13])
    W = (38.3213 + 13.17635815*d - 1.4e-12*d*d + 3.5610*s(E[1]) + 0.1208*s(E[2]) - 0.0642*s(E[3]) + 0.0158*s(E[4]) + 0.0252*s(E[5])
         - 0.0066*s(E[6]) - 0.0047*s(E[7]) - 0.0046*s(E[8]) + 0.0028*s(E[9]) + 0.0052*s(E[10]) + 0.0040*s(E[11]) + 0.0019*s(E[12]) - 0.0044*s(E[13]))
    return Rz(np.radians(W)) @ Rx(np.radians(90 - d0)) @ Rz(np.radians(90 + a0))

FRAMES = {'DE421 ME (+)': me_from_pa(+1) @ M_pa, 'DE421 ME (-)': me_from_pa(-1) @ M_pa, 'DE421 PA': M_pa, 'IAU 2015': iau(jd)}
moon_p, moon_v = bary('moon', jd)
targets = {b: bary(b, jd) for b in ('sun', 'earth')}

def azel(frame, lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    up_b = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    east_b = np.array([-np.sin(lo), np.cos(lo), 0.0]); north_b = np.cross(up_b, east_b)
    site_icrf = np.einsum('nji,j->ni', frame, up_b * R_MOON)  # body -> ICRF (transpose)
    obs = moon_p + site_icrf
    out = {}
    for b, (tp, _) in targets.items():
        tau = np.linalg.norm(tp - obs, axis=1) / C
        for _ in range(3):
            pt, _v = bary(b, jd - tau)
            tau = np.linalg.norm(pt - obs, axis=1) / C
        u = pt - obs; u /= np.linalg.norm(u, axis=1)[:, None]
        beta = moon_v / C  # observer velocity / c (site rotation ~5 m/s ignored: < 0.001 deg)
        u = u + beta - u * np.sum(u * beta, 1)[:, None]; u /= np.linalg.norm(u, axis=1)[:, None]
        ub = np.einsum('nij,nj->ni', frame, u)
        e, nn, up = ub @ east_b, ub @ north_b, ub @ up_b
        out[b] = (np.degrees(np.arctan2(e, nn)) % 360, np.degrees(np.arcsin(np.clip(up, -1, 1))))
    return out

wrap = lambda d: (d + 180) % 360 - 180
rows = []
for frame_name, F in FRAMES.items():
    for s in ds['sites']:
        r = azel(F, s['lat'], s['lonEast'])
        sky = np.array(s['skyline'])
        rec = {'frame': frame_name, 'site': s['id']}
        for b in ('sun', 'earth'):
            az, el = r[b]
            raz, rel = np.array(s['series'][b + 'Az']), np.array(s['series'][b + 'El'])
            de = el - rel
            da = wrap(az - raz) * np.cos(np.radians(rel))  # azimuth error as an angle on the sky
            vis = (el > sky[np.round(az).astype(int) % 360]).astype(int)
            rvis = np.array(s['series'][b + 'Vis'])
            rec[b] = dict(el_max=float(np.abs(de).max()), el_rms=float(np.sqrt((de**2).mean())), az_max=float(np.abs(da).max()),
                          vis_diff=int((vis != rvis).sum()), pct_me=float(100 * vis.mean()), pct_rocky=float(100 * rvis.mean()))
        rows.append(rec)
json.dump(rows, open('ephem_check.json', 'w'), indent=1)
for frame_name in FRAMES:
    sub = [r for r in rows if r['frame'] == frame_name]
    m = lambda b, k: max(r[b][k] for r in sub)
    print(f"{frame_name:14} sun el max {m('sun','el_max'):.4f}  az max {m('sun','az_max'):.4f} | earth el max {m('earth','el_max'):.4f}  az max {m('earth','az_max'):.4f} | vis flips sun {sum(r['sun']['vis_diff'] for r in sub)} earth {sum(r['earth']['vis_diff'] for r in sub)}")
