"""
Compare Gnomon's long-term sunlight and Earth-visibility percentages with NASA PGDA's
polar illumination maps (pgda_samples.json, read by pgda_sample.js).

PGDA defines sunlight as the average fraction of the Sun's disc that is visible, and Earth as
visible when any part of its disc shows. To compare like with like we compute both of those
from Gnomon's own data (app/public/data/sites.json) in addition to the app's centre rule.
Output: pgda_comparison.json (also copied into the app for the Validation panel).
"""
import json, math, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SUN_R = 0.2666     # mean apparent radius of the Sun from the Moon, deg
EARTH_R = 0.95     # mean apparent radius of the Earth from the Moon, deg (0.90-1.00 over a month)

def sky_at(sky, az):
    """Skyline elevation at azimuth az, linearly interpolated between the 1-degree bins."""
    a = az % 360.0
    i = int(math.floor(a)); f = a - i
    return sky[i % 360] * (1 - f) + sky[(i + 1) % 360] * f

def disc_fraction(h, r):
    """Fraction of a disc of radius r whose centre is h degrees above a straight horizon."""
    x = max(-1.0, min(1.0, h / r))
    return 1 - (math.acos(x) - x * math.sqrt(1 - x * x)) / math.pi

def main():
    ds = json.loads((ROOT / 'app/public/data/sites.json').read_text())
    pg = json.loads((ROOT / 'pipeline/validation/pgda_samples.json').read_text())
    finest = {}
    for s in pg['samples']:
        kind = 'earth' if s['product'].endswith('_EARTH') else 'sun'
        k = (s['id'], kind)
        if k not in finest or s['px'] < finest[k]['px']:
            finest[k] = s
    rows = []
    for site in ds['sites']:
        se = site['series']; sky = site['skyline']; n = len(se['sunEl'])
        sun_c = 100 * sum(se['sunVis']) / n
        earth_c = 100 * sum(se['earthVis']) / n
        sun_disc = 100 * sum(disc_fraction(se['sunEl'][i] - sky_at(sky, se['sunAz'][i]), SUN_R) for i in range(n)) / n
        earth_any = 100 * sum(1 for i in range(n) if se['earthEl'][i] + EARTH_R > sky_at(sky, se['earthAz'][i])) / n
        row = {'id': site['id'], 'name': site['name'], 'terrain': site['terrain'],
               'ours': {'sunCentrePct': round(sun_c, 1), 'sunDiscPct': round(sun_disc, 1),
                        'earthCentrePct': round(earth_c, 1), 'earthAnyPct': round(earth_any, 1)}}
        ps, pe = finest.get((site['id'], 'sun')), finest.get((site['id'], 'earth'))
        if ps:
            row['pgda'] = {'product': ps['product'], 'px_m': ps['px'],
                           'sunPct': round(100 * ps['point'], 1), 'sunPct500m': [round(100 * ps['r500']['min'], 1), round(100 * ps['r500']['max'], 1)],
                           'earthPct': round(100 * pe['point'], 1), 'earthPct500m': [round(100 * pe['r500']['min'], 1), round(100 * pe['r500']['max'], 1)]}
            row['diff'] = {'sun': round(sun_disc - 100 * ps['point'], 1), 'earth': round(earth_any - 100 * pe['point'], 1)}
            row['withinPgda500m'] = {
                'sun': ps['r500']['min'] * 100 - 0.05 <= sun_disc <= ps['r500']['max'] * 100 + 0.05,
                'earth': pe['r500']['min'] * 100 - 0.05 <= earth_any <= pe['r500']['max'] * 100 + 0.05}
        else:
            row['pgda'] = None
            row['note'] = 'Outside the PGDA polar maps (north of 65 S): no NASA illumination map to compare with.'
        rows.append(row)
    cmp = [r for r in rows if r['pgda']]
    summary = {
        'sitesCompared': len(cmp),
        'sunMeanAbsDiff': round(sum(abs(r['diff']['sun']) for r in cmp) / len(cmp), 1),
        'sunMaxAbsDiff': max(abs(r['diff']['sun']) for r in cmp),
        'earthMeanAbsDiff': round(sum(abs(r['diff']['earth']) for r in cmp) / len(cmp), 1),
        'earthMaxAbsDiff': max(abs(r['diff']['earth']) for r in cmp),
        'sunWithin500mRange': sum(r['withinPgda500m']['sun'] for r in cmp),
        'earthWithin500mRange': sum(r['withinPgda500m']['earth'] for r in cmp),
    }
    out = {'about': 'Gnomon vs NASA PGDA polar illumination maps (product 69, 2016 release). Ours: Nov 2026-Dec 2028, 2 h steps, observer 2 m. PGDA: hourly over 18.6 years, at the surface.',
           'sunRadiusDeg': SUN_R, 'earthRadiusDeg': EARTH_R, 'summary': summary, 'sites': rows}
    (ROOT / 'pipeline/validation/pgda_comparison.json').write_text(json.dumps(out, indent=1))
    print(json.dumps(summary, indent=1))
    print(f"{'site':18} {'ours sun c/disc':>16} {'PGDA sun':>9} {'500m range':>13} | {'ours earth c/any':>16} {'PGDA earth':>10} {'500m range':>13}")
    for r in rows:
        o = r['ours']; p = r['pgda']
        if p:
            print(f"{r['id']:18} {o['sunCentrePct']:7}/{o['sunDiscPct']:6}   {p['sunPct']:7}  {str(p['sunPct500m']):>13} | {o['earthCentrePct']:7}/{o['earthAnyPct']:6}   {p['earthPct']:8}  {str(p['earthPct500m']):>13}")
        else:
            print(f"{r['id']:18} {o['sunCentrePct']:7}/{o['sunDiscPct']:6}   {'n/a':>7}  | {o['earthCentrePct']:7}/{o['earthAnyPct']:6}")

if __name__ == '__main__':
    sys.exit(main())
