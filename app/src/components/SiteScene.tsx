import { Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { skylineAt } from '../lib/sky'
import {
  areaAtLeast, contour, gridAt, METRIC_KEY, rampColor, rampCss, useTerrain,
  type Metric, type SiteTerrain,
} from '../lib/siteTerrain'
import type { Site } from '../lib/types'

const MOON_R = 1737400
const KM = 1 / 1000 // scene units are kilometres
const SKY_DIST = 60 // km: where the Sun and Earth discs sit
const CAM_HOME = new THREE.Vector3(0, 2.1, 4.3)

const METRIC_LABEL: Record<Metric, { name: string; lit: string }> = {
  sun: { name: 'Sun', lit: 'sunlit' },
  earth: { name: 'Earth', lit: 'Earth in view' },
  both: { name: 'Sun + Earth', lit: 'Sun + Earth' },
}

/** Scene direction (x = east, y = up, z = south) of a body at az/el, with its elevation
 * stretched like the terrain (tan el × exaggeration) so shadow lengths on the ground stay true. */
function skyDir(az: number, el: number, exag: number): THREE.Vector3 {
  const a = (az * Math.PI) / 180
  const e = Math.atan(Math.tan((el * Math.PI) / 180) * exag)
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e))
}

function buildGeometry(t: SiteTerrain): THREE.BufferGeometry {
  const { size, spacing_m } = t.meta.terrain!
  const half = (size - 1) / 2
  const pos = new Float32Array(size * size * 3)
  const uv = new Float32Array(size * size * 2)
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const i = r * size + c
    pos[i * 3] = (c - half) * spacing_m * KM
    pos[i * 3 + 1] = t.heights[i] * KM
    pos[i * 3 + 2] = (r - half) * spacing_m * KM // row 0 = north = −z
    uv[i * 2] = c / (size - 1)
    uv[i * 2 + 1] = 1 - r / (size - 1)
  }
  const idx = new Uint32Array((size - 1) * (size - 1) * 6)
  let k = 0
  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
    const a = r * size + c, b = a + 1, d = a + size, e = d + 1
    idx.set([a, d, b, b, d, e], k)
    k += 6
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(new THREE.BufferAttribute(idx, 1))
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

/** Regolith material whose direct (Sun) light is multiplied by a mask: 0 where distant ridges
 * (beyond the patch's own shadows) hide the Sun at this time, from the exposure grid. */
function makeMaterial(mask: THREE.DataTexture, half: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#8c8b87', roughness: 1, metalness: 0 })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMask = { value: mask }
    sh.uniforms.uMaskHalf = { value: half }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMaskUv;\nuniform float uMaskHalf;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMaskUv = vec2((position.x + uMaskHalf), (uMaskHalf + position.z)) / (2.0 * uMaskHalf);')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMaskUv;\nuniform sampler2D uMask;')
      .replace('#include <aomap_fragment>', 'float rockyMask = texture2D(uMask, clamp(vMaskUv, 0.0, 1.0)).r;\nreflectedLight.directDiffuse *= rockyMask;\nreflectedLight.directSpecular *= rockyMask;\n#include <aomap_fragment>')
  }
  m.customProgramCacheKey = () => 'rocky-terrain-mask'
  return m
}

function discTexture(inner: string, outer: string, core: number): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grd.addColorStop(0, inner)
  grd.addColorStop(core, inner)
  grd.addColorStop(Math.min(1, core + 0.06), outer)
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Fill the n × n mask with how much of the Sun's disc clears each grid point's distant skyline. */
function writeSunMask(mask: THREE.DataTexture, terrain: SiteTerrain, sunAz: number, sunEl: number) {
  const ex = terrain.meta.exposure!
  const d = mask.image.data as Uint8Array
  const a = (sunAz * Math.PI) / 180
  const bin = ((Math.round(sunAz) % 360) + 360) % 360
  const half = (ex.n - 1) / 2
  for (let r = 0; r < ex.n; r++) for (let c = 0; c < ex.n; c++) {
    const p = r * ex.n + c
    const e = (c - half) * ex.spacing_m, n = (half - r) * ex.spacing_m
    // the local vertical leans by offset / R, so the Sun sits a little higher on the sunward side
    const el = sunEl + ((e * Math.sin(a) + n * Math.cos(a)) / MOON_R) * (180 / Math.PI)
    const sky = terrain.farSky[p * 360 + bin] / 10 - 5
    // the Sun's disc is ~0.53° across: fade over that instead of a hard step
    const v = Math.max(0, Math.min(1, (el - sky) / 0.53 + 0.5))
    d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = Math.round(v * 255)
    d[p * 4 + 3] = 255
  }
  mask.needsUpdate = true
}

type LabelEls = React.RefObject<Map<string, HTMLDivElement>>

/** Moves the HTML labels (rendered outside the canvas) onto their 3D points every rendered frame. */
function ProjectLabels({ points, els }: { points: Record<string, THREE.Vector3>; els: LabelEls }) {
  const { camera, size } = useThree()
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    for (const [key, pos] of Object.entries(points)) {
      const el = els.current?.get(key)
      if (!el) continue
      const p = tmp.copy(pos).project(camera)
      const show = p.z < 1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2
      el.style.opacity = show ? '1' : '0'
      if (show) el.style.transform = `translate(${(p.x * 0.5 + 0.5) * size.width}px, ${(-p.y * 0.5 + 0.5) * size.height}px) translate(-50%, -50%)`
    }
  })
  return null
}

interface WorldProps {
  els: LabelEls
  site: Site
  terrain: SiteTerrain
  idx: number
  exag: number
  showExposure: boolean
  showArea: boolean
  metric: Metric
  threshold: number
  recenter: number
}

function World({ els, site, terrain, idx, exag, showExposure, showArea, metric, threshold, recenter }: WorldProps) {
  const t = terrain.meta.terrain!
  const ex = terrain.meta.exposure!
  const halfKm = (t.extent_m / 2) * KM
  const maskHalf = ((ex.extent_m + ex.spacing_m) / 2) * KM // texel centres sit on the grid points

  const geometry = useMemo(() => buildGeometry(terrain), [terrain])
  const mask = useMemo(() => {
    const tex = new THREE.DataTexture(new Uint8Array(ex.n * ex.n * 4), ex.n, ex.n, THREE.RGBAFormat)
    tex.magFilter = tex.minFilter = THREE.LinearFilter
    return tex
  }, [ex.n])
  const material = useMemo(() => makeMaterial(mask, maskHalf), [mask, maskHalf])
  const sunTex = useMemo(() => discTexture('rgba(255,250,235,1)', 'rgba(255,214,140,0.35)', 0.16), [])
  const earthTex = useMemo(() => discTexture('rgba(92,150,255,1)', 'rgba(60,120,255,0.15)', 0.42), [])
  useEffect(() => () => { geometry.dispose() }, [geometry])
  useEffect(() => () => { material.dispose(); mask.dispose() }, [material, mask])
  useEffect(() => () => { sunTex.dispose(); earthTex.dispose() }, [sunTex, earthTex])

  // Heat map: the exposure grid, bilinear, painted on a canvas covering the whole patch.
  const heat = useMemo(() => {
    const W = 512
    const c = document.createElement('canvas')
    c.width = c.height = W
    const g = c.getContext('2d')!
    const img = g.createImageData(W, W)
    const vals = ex[METRIC_KEY[metric]]
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const e = ((x + 0.5) / W - 0.5) * t.extent_m, n = (0.5 - (y + 0.5) / W) * t.extent_m
      const v = gridAt(vals, ex.n, ex.spacing_m, e, n)
      if (Number.isNaN(v)) continue
      const [r, gg, b] = rampColor(metric, v)
      const o = (y * W + x) * 4
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255
    }
    g.putImageData(img, 0, 0)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }, [ex, metric, t.extent_m])
  useEffect(() => () => heat.dispose(), [heat])

  // Contour at the threshold, subdivided so it follows the terrain between grid points.
  const lines = useMemo(() => {
    if (!showArea) return null
    const segs = contour(ex[METRIC_KEY[metric]], ex.n, ex.spacing_m, threshold)
    if (!segs.length) return null
    const pts: [number, number, number][] = []
    const lift = 6 // m above the ground
    const P = (e: number, n: number): [number, number, number] => {
      const h = gridAt(terrain.heights, t.size, t.spacing_m, e, n)
      return [e * KM, ((Number.isNaN(h) ? 0 : h) + lift) * KM, -n * KM]
    }
    const sub = 5
    for (const [a, b] of segs) {
      for (let i = 0; i < sub; i++) {
        const f0 = i / sub, f1 = (i + 1) / sub
        pts.push(P(a[0] + (b[0] - a[0]) * f0, a[1] + (b[1] - a[1]) * f0), P(a[0] + (b[0] - a[0]) * f1, a[1] + (b[1] - a[1]) * f1))
      }
    }
    return pts
  }, [showArea, ex, metric, threshold, terrain.heights, t.size, t.spacing_m])

  const s = site.series
  const sunAz = s.sunAz[idx], sunEl = s.sunEl[idx], earthAz = s.earthAz[idx], earthEl = s.earthEl[idx]
  const sunDir = useMemo(() => skyDir(sunAz, sunEl, exag), [sunAz, sunEl, exag])
  const earthDir = useMemo(() => skyDir(earthAz, earthEl, exag), [earthAz, earthEl, exag])
  const sunUp = sunEl > skylineAt(site.skyline, sunAz)
  const earthUp = earthEl > skylineAt(site.skyline, earthAz)
  // Auto exposure, like a camera: at the poles the Sun is only a degree or two up (or even below
  // the flat horizon, seen from a peak), so level ground gets ~3 % of full light. Scale the light
  // so sunlit ground reads mid-grey. Occlusion is left to the shadow map and the distant-terrain mask.
  const exposure = Math.min(30, 1.6 / Math.max(0.05, sunDir.y))

  const invalidate = useThree((st) => st.invalidate)
  // Distant-terrain mask for this time: Sun elevation at each grid point vs its far skyline.
  useEffect(() => {
    writeSunMask(mask, terrain, sunAz, sunEl)
    invalidate()
  }, [mask, terrain, sunAz, sunEl, invalidate])

  // Fit the shadow camera tightly around the (exaggerated) terrain as seen from the Sun.
  const light = useRef<THREE.DirectionalLight>(null)
  useLayoutEffect(() => {
    const L = light.current
    if (!L) return
    L.position.copy(sunDir).multiplyScalar(20)
    L.target.position.set(0, 0, 0)
    L.target.updateMatrixWorld()
    L.updateMatrixWorld()
    const cam = L.shadow.camera
    cam.position.copy(L.position)
    cam.lookAt(0, 0, 0)
    cam.updateMatrixWorld()
    const inv = cam.matrixWorldInverse
    const b = new THREE.Box3()
    const lo = t.minHeight_m * KM * exag, hi = t.maxHeight_m * KM * exag
    for (const x of [-halfKm, halfKm]) for (const z of [-halfKm, halfKm]) for (const y of [lo, hi]) b.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(inv))
    const m = 0.05
    cam.left = b.min.x - m; cam.right = b.max.x + m; cam.bottom = b.min.y - m; cam.top = b.max.y + m
    cam.near = Math.max(0.01, -b.max.z - 1); cam.far = -b.min.z + 1
    cam.updateProjectionMatrix()
    L.shadow.needsUpdate = true
    invalidate()
  }, [sunDir, exag, halfKm, t.minHeight_m, t.maxHeight_m, invalidate])

  const controls = useRef<OrbitControlsImpl>(null)
  const { camera } = useThree()
  useEffect(() => {
    camera.position.copy(CAM_HOME)
    controls.current?.target.set(0, 0, 0)
    controls.current?.update()
    invalidate()
  }, [recenter, camera, invalidate, site.id])

  const edge = t.extent_m / 2 - 40
  const labelPoints = useMemo(() => {
    const at = (e: number, n: number) => new THREE.Vector3(e * KM, (gridAt(terrain.heights, t.size, t.spacing_m, e, n) || 0) * KM * exag + 0.03, -n * KM)
    return {
      landing: new THREE.Vector3(0, 0.19, 0),
      N: at(0, edge), E: at(edge, 0), S: at(0, -edge), W: at(-edge, 0),
      sun: sunDir.clone().multiplyScalar(SKY_DIST).add(new THREE.Vector3(0, 2.4, 0)),
      earth: earthDir.clone().multiplyScalar(SKY_DIST).add(new THREE.Vector3(0, 2.2, 0)),
    }
  }, [terrain.heights, t.size, t.spacing_m, exag, edge, sunDir, earthDir])

  return (
    <>
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={0.14} />
      <directionalLight
        ref={light}
        castShadow
        intensity={exposure}
        color="#fff6e8"
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.012}
      />
      <group scale={[1, exag, 1]}>
        <mesh geometry={geometry} material={material} castShadow receiveShadow />
        {showExposure && (
          <mesh geometry={geometry} renderOrder={1}>
            <meshBasicMaterial map={heat} transparent opacity={0.72} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} toneMapped={false} />
          </mesh>
        )}
        {lines && <Line points={lines} segments color="#ff3b30" lineWidth={2.5} renderOrder={2} />}
      </group>

      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.004, 0.004, 0.12, 8]} />
        <meshBasicMaterial color="#3ddc97" />
      </mesh>
      <mesh position={[0, 0.125, 0]}>
        <sphereGeometry args={[0.014, 16, 16]} />
        <meshBasicMaterial color="#3ddc97" />
      </mesh>
      <ProjectLabels points={labelPoints} els={els} />

      <sprite position={sunDir.clone().multiplyScalar(SKY_DIST)} scale={[3.2, 3.2, 1]} renderOrder={-1}>
        <spriteMaterial map={sunTex} transparent opacity={sunUp ? 1 : 0.18} depthWrite={false} toneMapped={false} />
      </sprite>
      <sprite position={earthDir.clone().multiplyScalar(SKY_DIST)} scale={[2.4, 2.4, 1]} renderOrder={-1}>
        <spriteMaterial map={earthTex} transparent opacity={earthUp ? 1 : 0.18} depthWrite={false} toneMapped={false} />
      </sprite>

      <OrbitControls
        ref={controls}
        makeDefault
        target={[0, 0, 0]}
        enableDamping
        dampingFactor={0.08}
        minDistance={0.35}
        maxDistance={12}
        maxPolarAngle={Math.PI * 0.48}
        enablePan={false}
      />
    </>
  )
}

function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md bg-[#0f1626]/85 p-0.5 ring-1 ring-white/15">
      {options.map(([v, text]) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={v === value}
          onClick={() => onChange(v)}
          className={`min-h-7 rounded-[5px] px-2 text-xs font-medium transition-colors duration-150 ${v === value ? 'bg-[#e5e9f1] text-[#0f1626]' : 'text-[#c9d1e0] hover:text-white'}`}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

const btn = (on: boolean) =>
  `pointer-events-auto rounded-md px-2.5 py-1 text-xs font-medium ring-1 backdrop-blur transition-colors duration-150 active:scale-[0.97] ${
    on ? 'bg-[#e5e9f1] text-[#0f1626] ring-transparent' : 'bg-[#0f1626]/80 text-[#e5e9f1] ring-white/15 hover:bg-[#1d2a44]'
  }`

/**
 * "Play mission": steps the shared mission-time cursor from landing to the end of the mission, so the
 * Sun and Earth move across the sky and the shadows sweep the terrain. 1× = one mission day per second.
 */
function usePlayback(idx: number, range: [number, number] | undefined, stepsPerDay: number, onCursor: ((i: number) => void) | undefined) {
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const at = useRef(idx)
  at.current = idx
  const hasRange = !!range
  const first = range ? range[0] : idx
  const last = range ? range[1] - 1 : idx
  useEffect(() => {
    if (!playing || !hasRange || !onCursor) return
    let raf = 0
    let prev = performance.now()
    let acc = 0
    const tick = (now: number) => {
      acc += ((now - prev) / 1000) * stepsPerDay * speed
      prev = now
      if (acc >= 1) {
        const n = Math.floor(acc)
        acc -= n
        const next = Math.min(last, at.current + n)
        onCursor(next)
        if (next >= last) { setPlaying(false); return }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, hasRange, onCursor, stepsPerDay, speed, last])
  const toggle = () => {
    if (!hasRange || !onCursor) return
    if (!playing && at.current >= last) onCursor(first) // finished: start over from the landing
    setPlaying((p) => !p)
  }
  return { playing, toggle, speed, setSpeed, canPlay: hasRange && !!onCursor && last > first }
}

export default function SiteScene({ site, idx, range, stepsPerDay = 12, timeLabel, onCursor }: {
  site: Site
  idx: number
  /** Mission index range [landing, end) for Play mission. */
  range?: [number, number]
  stepsPerDay?: number
  /** Readout of the selected time, shown while playing. */
  timeLabel?: string
  onCursor?: (idx: number) => void
}) {
  const { value: terrain, loading } = useTerrain(site.id)
  const play = usePlayback(idx, range, stepsPerDay, onCursor)
  const [exag, setExag] = useState(1)
  const [showExposure, setShowExposure] = useState(false)
  const [showArea, setShowArea] = useState(false)
  const [metric, setMetric] = useState<Metric>('sun')
  const [threshold, setThreshold] = useState(60)
  const [recenter, setRecenter] = useState(0)
  const els = useRef(new Map<string, HTMLDivElement>())
  const setEl = (key: string) => (el: HTMLDivElement | null) => { if (el) els.current.set(key, el); else els.current.delete(key) }

  const ex = terrain?.meta.exposure
  const area = useMemo(() => (ex && showArea ? areaAtLeast(ex[METRIC_KEY[metric]], ex.n, ex.spacing_m, threshold) : null), [ex, showArea, metric, threshold])

  if (loading) return <div className="grid h-full place-items-center text-sm text-[#a2adc2]">Loading terrain…</div>
  if (!terrain || !terrain.meta.available || !terrain.meta.terrain || !ex) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="max-w-[34ch]">
          <div className="text-[15px] font-semibold text-[#f5f5f7]">No high-resolution terrain for this site</div>
          <p className="mt-2 text-sm leading-relaxed text-[#a2adc2]">
            {terrain?.meta.reason ?? "The terrain file couldn't be loaded."} Site 3D needs a 5 m or 20 m elevation model; Gnomon won't draw a made-up surface.
          </p>
        </div>
      </div>
    )
  }

  const t = terrain.meta.terrain
  const s = site.series
  const sunUp = s.sunEl[idx] > skylineAt(site.skyline, s.sunAz[idx])
  const earthUp = s.earthEl[idx] > skylineAt(site.skyline, s.earthAz[idx])
  const ml = METRIC_LABEL[metric]

  return (
    <div className="relative h-full w-full">
      <Canvas
        key={site.id}
        shadows
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ position: CAM_HOME.toArray(), fov: 45, near: 0.01, far: 400 }}
        gl={{ antialias: true }}
        className="cursor-grab active:cursor-grabbing"
      >
        <World els={els} site={site} terrain={terrain} idx={idx} exag={exag} showExposure={showExposure} showArea={showArea} metric={metric} threshold={threshold} recenter={recenter} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div ref={setEl('landing')} className="absolute left-0 top-0 whitespace-nowrap rounded-full bg-[#3ddc97] px-2 py-0.5 text-[11px] font-medium text-[#04140d] shadow" style={{ opacity: 0 }}>Landing point</div>
        {['N', 'E', 'S', 'W'].map((l) => (
          <div key={l} ref={setEl(l)} className="absolute left-0 top-0 select-none text-[13px] font-semibold text-[#e5e9f1]/85 [text-shadow:0_1px_3px_#000]" style={{ opacity: 0 }}>{l}</div>
        ))}
        <div ref={setEl('sun')} className="absolute left-0 top-0 text-[11px] text-[#ffe7a3] [text-shadow:0_1px_3px_#000]" style={{ opacity: 0 }}>Sun</div>
        <div ref={setEl('earth')} className="absolute left-0 top-0 text-[11px] text-[#9cc2ff] [text-shadow:0_1px_3px_#000]" style={{ opacity: 0 }}>Earth</div>
      </div>

      <div
        className="pointer-events-none absolute z-20 flex flex-wrap items-center justify-end gap-2 transition-[left,right,top] duration-200"
        style={{
          left: 'calc(var(--map-left, 0px) + 150px)',
          right: 'calc(var(--map-right, 0px) + 12px)',
          top: 'calc(var(--map-top, 0px) + 12px)',
        }}
      >
        <button type="button" aria-pressed={showExposure} onClick={() => setShowExposure((v) => !v)} className={btn(showExposure)}
          title="Heat map of how often each spot sees the Sun (or Earth), Nov 2026 – Dec 2028, from the 100 m exposure grid">
          Sun exposure
        </button>
        <button type="button" aria-pressed={showArea} onClick={() => setShowArea((v) => !v)} className={btn(showArea)}
          title="Outline of the area that is lit at least the threshold share of the time">
          Sunlit area
        </button>
        <button type="button" onClick={() => setRecenter((n) => n + 1)} className={btn(false)} title="Back to the default view of the landing point">
          Recenter
        </button>
      </div>

      <div
        className="absolute z-20 flex flex-col gap-1.5 rounded-[10px] bg-[#0b0f18]/80 p-2 text-[11px] text-[#a2adc2] ring-1 ring-white/10 backdrop-blur transition-[left,right,bottom] duration-200"
        style={{
          left: 'calc(var(--map-left, 0px) + 12px)',
          right: 'calc(var(--map-right, 0px) + 12px)',
          bottom: 'calc(var(--map-bottom, 0px) + 12px)',
        }}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {play.canPlay && (
            <>
              <button
                type="button"
                onClick={play.toggle}
                aria-pressed={play.playing}
                title="Timelapse of the mission: watch the Sun and Earth move and the shadows sweep the site"
                className="flex h-7 items-center gap-1.5 rounded-md bg-[#e5e9f1] px-2.5 text-xs font-medium text-[#0f1626] transition-transform duration-100 active:scale-[0.97]"
              >
                {play.playing ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden><rect x="1.5" y="1" width="2.5" height="8" rx="0.5" /><rect x="6" y="1" width="2.5" height="8" rx="0.5" /></svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden><path d="M2.5 1.2v7.6a.5.5 0 0 0 .77.42l5.9-3.8a.5.5 0 0 0 0-.84l-5.9-3.8a.5.5 0 0 0-.77.42z" /></svg>
                )}
                {play.playing ? 'Pause' : 'Play mission'}
              </button>
              <Segmented label="Playback speed" value={play.speed} onChange={play.setSpeed} options={[[1, '1 day/s'], [4, '4 days/s']]} />
              {timeLabel && <span className="tabular text-[#e5e9f1]">{timeLabel}</span>}
            </>
          )}
          <Segmented label="Vertical exaggeration" value={exag} onChange={setExag} options={[[1, '1×'], [2, '2×'], [3, '3×']]} />
          {(showExposure || showArea) && (
            <Segmented label="Exposure of" value={metric} onChange={setMetric} options={[['sun', 'Sun'], ['earth', 'Earth'], ['both', 'Both']]} />
          )}
          {showArea && (
            <label className="flex items-center gap-2">
              <span className="sr-only">Threshold</span>
              <input type="range" min={10} max={95} step={5} value={threshold} onChange={(e) => setThreshold(+e.target.value)} className="w-24 sm:w-32" aria-label="Sunlit area threshold" />
              <span className="tabular text-[#e5e9f1]">≥{threshold}%</span>
            </label>
          )}
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#ffd98a]" style={{ opacity: sunUp ? 1 : 0.3 }} />Sun {sunUp ? 'in view' : 'behind terrain'}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#5c96ff]" style={{ opacity: earthUp ? 1 : 0.3 }} />Earth {earthUp ? 'in view' : 'behind terrain'}</span>
          </span>
        </div>
        {!sunUp && !play.playing && (
          <p className="text-[#f5f5f7]">The Sun is behind the terrain at the landing point now: the site is in shadow. Move the mission time to see it lit.</p>
        )}
        {(showExposure || area !== null) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {showExposure && (
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="tabular">0%</span>
                <span className="h-2 w-28 rounded-sm" style={{ background: rampCss(metric) }} aria-hidden />
                <span className="tabular">100%</span>
                <span>{ml.name} in view, Nov 2026 – Dec 2028</span>
              </span>
            )}
            {area !== null && (
              <span className="flex items-center gap-1.5 text-[#f5f5f7]">
                <span className="h-0.5 w-4 bg-[#ff3b30]" aria-hidden />
                ≥{threshold}% {ml.lit}: {area > 0 ? `≈${area.toFixed(2)} km²` : 'none'} <span className="text-[#a2adc2]">{area > 0 ? 'of' : 'in'} the 3 × 3 km grid</span>
              </span>
            )}
          </div>
        )}
        <p className="hidden leading-snug text-[#8b95a8] sm:block">
          {t.source}: {t.resolution} 6 × 6 km.{' '}
          {exag > 1 ? `Heights ×${exag} (exaggerated); Sun/Earth heights stretched the same way so shadows keep their true length.` : 'Heights true to scale.'}{' '}
          Brightness auto-adjusted for the low Sun, like a camera; shadowed ground is lifted slightly so its shape stays readable.{' '}
          Exposure: 100 m grid, each point with its own skyline, using the landing point's Sun/Earth directions.
        </p>
        <details className="text-[#8b95a8] sm:hidden">
          <summary className="cursor-pointer select-none">About this view</summary>
          <p className="mt-1 leading-snug">
          {t.source}: {t.resolution} 6 × 6 km.{' '}
          {exag > 1 ? `Heights ×${exag} (exaggerated); Sun/Earth heights stretched the same way so shadows keep their true length.` : 'Heights true to scale.'}{' '}
          Brightness auto-adjusted for the low Sun, like a camera; shadowed ground is lifted slightly so its shape stays readable.{' '}
          Exposure: 100 m grid, each point with its own skyline, using the landing point's Sun/Earth directions.
        </p>
        </details>
      </div>
    </div>
  )
}
