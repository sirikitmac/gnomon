"""
M4 / m3: stamp a data version, build date, inputs and checks into sites.json, and record the
coordinate frame each site's position comes from. Does not change any numbers.
Frames: JPL Horizons takes lunar surface sites (coord@301) in the Moon's Mean-Earth frame of
DE421 (Horizons manual), the same frame as LRO LOLA / PGDA terrain and LROC coordinates.
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
P = ROOT / 'app/public/data/sites.json'

FRAMES = {
    'mons-mouton':      ('ME', 'IM-2 touchdown point measured on LRO LROC images (LRO products use the Mean-Earth frame).'),
    'shackleton-ce7':   ('unknown', 'CNSA presentation to UN COPUOS gives no frame; ME vs PA can shift a point by up to about 1 km, so treat the exact spot as approximate.'),
    'malapert':         ('ME', 'Kring et al. 2025 (JGR Planets) work on LOLA-based maps, which use the Mean-Earth frame.'),
    'haworth':          ('ME', 'Centre of the PGDA Haworth 5 m LOLA tile (Mean-Earth frame).'),
    'chandrayaan-3':    ('ME', 'Lander located on LRO LROC images (Mean-Earth frame).'),
    'apollo-11':        ('ME', 'NSSDCA Apollo 11 LM coordinates, measured from LRO imaging (Mean-Earth frame).'),
    'shackleton-ridge': ('ME', 'LROC image release coordinates (Mean-Earth frame).'),
    'nobile-rim-2':     ('ME', 'arXiv:2406.19863 site table, from LOLA-based maps (Mean-Earth frame).'),
    'change-4':         ('ME', 'Lander located on LRO LROC images (Mean-Earth frame).'),
}

d = json.loads(P.read_text())
d['meta']['notes'] = ('Sun/Earth azimuth and elevation from JPL Horizons (DE441 ephemeris; sites in the DE421 Mean-Earth frame); '
                      'terrain from LRO LOLA (PGDA). Visibility = body centre above skyline.')
d['meta']['provenance'] = {
    'version': '2026.11.13',
    'built': '2026-11-13',
    'ephemeris': 'JPL Horizons, DE441 planetary ephemeris; lunar sites in the DE421 Mean-Earth (ME) frame',
    'terrain': 'LRO LOLA via NASA GSFC PGDA: 5 m site DEMs (product 78) where available, 20 m and 240 m polar mosaics (product 90), Moon curvature included, observer 2 m',
    'independentChecks': [
        'Sun/Earth positions vs our own calculation from JPL DE421 (jplephem, DE421 lunar librations): max difference 0.0005 deg over 170,874 positions',
        'Long-term sunlight and Earth visibility vs NASA PGDA polar illumination maps (product 69): sunlight within 2.1 points on average, 7 polar sites (pipeline/validation/pgda_comparison.json)',
        'Skyline built two ways from the same LOLA terrain and compared site by site',
    ],
}
for s in d['sites']:
    f, note = FRAMES[s['id']]
    s['frame'] = f
    s['frameNote'] = note
P.write_text(json.dumps(d, separators=(',', ':')))
print('stamped', d['meta']['provenance']['version'], len(d['sites']), 'sites')
