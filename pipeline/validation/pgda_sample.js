/**
 * Reads NASA PGDA lunar polar illumination maps (AVGVISIB GeoTIFFs) at Gnomon's sites without
 * downloading the whole file. Paste into the browser console on https://pgda.gsfc.nasa.gov
 * (same origin, so range requests are allowed), then: `await run()`. Output → pgda_samples.json.
 *
 * Files: https://pgda.gsfc.nasa.gov/products/69 (BigTIFF, int16, deflate + horizontal predictor,
 * 256 px tiles, polar stereographic R = 1737.4 km, value × 4e-5 = average visible disc fraction).
 * The server rate-limits bursts, so every request is spaced out and retried.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getRange(u, a, b) {
  for (let k = 0; k < 6; k++) {
    await sleep(700 + k * 2500)
    const r = await fetch(u, { headers: { Range: `bytes=${a}-${b}` }, cache: 'no-store' })
    const ab = await r.arrayBuffer()
    if (r.status === 206 && ab.byteLength === b - a + 1) return ab
  }
  throw new Error(`range failed ${a}-${b}`)
}
const rng = async (u, a, b) => new DataView(await getRange(u, a, b))

/** BigTIFF first IFD → { tag: {type, cnt, off, raw} } */
async function ifd(u) {
  const h = await rng(u, 0, 15)
  const first = Number(h.getBigUint64(8, true))
  const c = await rng(u, first, first + 8 + 20 * 40)
  const n = Number(c.getBigUint64(0, true))
  const SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8, 16: 8, 17: 1, 18: 8 }
  const tags = {}
  for (let i = 0; i < n; i++) {
    const e = 8 + i * 20
    const tag = c.getUint16(e, true), type = c.getUint16(e + 2, true), cnt = Number(c.getBigUint64(e + 4, true))
    const inline = (SZ[type] || 1) * cnt <= 8
    tags[tag] = { type, cnt, off: inline ? null : Number(c.getBigUint64(e + 12, true)), raw: inline && type === 3 ? c.getUint16(e + 12, true) : null }
  }
  return tags
}

async function openTif(u) {
  const t = await ifd(u)
  const nT = t[324].cnt
  const offs = await rng(u, t[324].off, t[324].off + 8 * nT - 1)
  const cnts = await rng(u, t[325].off, t[325].off + 4 * nT - 1)
  const sc = await rng(u, t[33550].off, t[33550].off + 23)
  const tp = await rng(u, t[33922].off, t[33922].off + 47)
  const g = await rng(u, t[42112].off, t[42112].off + t[42112].cnt - 1)
  const gtxt = new TextDecoder().decode(new Uint8Array(g.buffer))
  return {
    u, W: t[256].raw, H: t[257].raw, tw: t[322].raw, th: t[323].raw, pred: t[317]?.raw || 1,
    scale: parseFloat((gtxt.match(/role="scale">([^<]+)/) || [])[1] || '1'),
    offset: parseFloat((gtxt.match(/role="offset">([^<]+)/) || [])[1] || '0'),
    px: sc.getFloat64(0, true), x0: tp.getFloat64(24, true), y0: tp.getFloat64(32, true),
    tilesAcross: Math.ceil(t[256].raw / t[322].raw),
    off: (i) => Number(offs.getBigUint64(i * 8, true)), cnt: (i) => cnts.getUint32(i * 4, true), cache: new Map(),
  }
}

async function tile(T, ti) {
  if (T.cache.has(ti)) return T.cache.get(ti)
  const o = T.off(ti), n = T.cnt(ti)
  const raw = await getRange(T.u, o, o + n - 1)
  const buf = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer())
  const v = new DataView(buf.buffer), out = new Int16Array(T.tw * T.th)
  for (let r = 0; r < T.th; r++) {
    let acc = 0
    for (let c = 0; c < T.tw; c++) {
      let x = v.getUint16((r * T.tw + c) * 2, true)
      if (T.pred === 2) { acc = (acc + x) & 0xffff; x = acc }
      out[r * T.tw + c] = x > 32767 ? x - 65536 : x
    }
  }
  T.cache.set(ti, out)
  return out
}
const pix = async (T, col, row) => (await tile(T, Math.floor(row / T.th) * T.tilesAcross + Math.floor(col / T.tw)))[(row % T.th) * T.tw + (col % T.tw)]

/** South polar stereographic (lat0 = −90°, lon0 = 0°, k0 = 1, R = 1737.4 km) → pixel. */
function ll2px(T, lat, lon) {
  const R = 1737400, d = Math.PI / 180
  const rho = 2 * R * Math.tan(Math.PI / 4 + (lat * d) / 2)
  return [(rho * Math.sin(lon * d) - T.x0) / T.px, (T.y0 - rho * Math.cos(lon * d)) / T.px]
}

async function sample(T, lat, lon, radM) {
  const [cf, rf] = ll2px(T, lat, lon)
  const c = Math.floor(cf), r = Math.floor(rf)
  const k = Math.round(radM / T.px), vals = []
  for (let dr = -k; dr <= k; dr++) for (let dc = -k; dc <= k; dc++) {
    if ((dr * dr + dc * dc) * T.px * T.px > radM * radM) continue
    vals.push((await pix(T, c + dc, r + dr)) * T.scale + T.offset)
  }
  vals.sort((a, b) => a - b)
  return { centre: (await pix(T, c, r)) * T.scale + T.offset, min: vals[0], max: vals.at(-1), mean: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length }
}

const SITES = [
  ['shackleton-ridge', -89.684, -163.261], ['shackleton-ce7', -88.8, 123.4], ['haworth', -86.764, -22.777], ['malapert', -85.964, -2.319],
  ['mons-mouton', -84.7906, 29.1957], ['nobile-rim-2', -84.20156, 60.69989], ['chandrayaan-3', -69.3741, 32.32],
]

async function run() {
  const base = 'https://pgda.gsfc.nasa.gov/data/MoonIllumination/'
  const out = []
  for (const [p, latMax] of Object.entries({ '85S_060M': -85, '75S_120M': -75, '65S_240M': -65 })) {
    for (const kind of ['', '_EARTH']) {
      const T = await openTif(`${base}AVGVISIB_${p}_201608${kind}.TIF`)
      for (const [id, lat, lon] of SITES) {
        if (lat > latMax) continue
        const s0 = await sample(T, lat, lon, 0), s5 = await sample(T, lat, lon, 500)
        out.push({ product: `AVGVISIB_${p}_201608${kind}`, id, px: T.px, point: s0.centre, r500: { min: s5.min, mean: s5.mean, max: s5.max, n: s5.n } })
      }
    }
  }
  return out
}
