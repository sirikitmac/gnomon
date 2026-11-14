import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { earthPose } from '../lib/earthOrient'
import { subPoint } from '../lib/engine'
import { Earth, MilkyWay, StarField, Sun } from './SkyBodies'
import type { Site } from '../lib/types'

/** Same lat/lon → xyz mapping three.js uses for equirectangular textures on SphereGeometry. */
function latLonToVec(lat: number, lon: number, r = 1): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta))
}

/** Procedural cratered texture, used until a real NASA CGI Moon Kit map is dropped into /public/textures. */
function makeProceduralMoon(): THREE.CanvasTexture {
  const w = 2048, h = 1024
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#8d8d8f'
  g.fillRect(0, 0, w, h)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  // maria: big dark blotches
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w, y = h * (0.25 + rnd() * 0.5), r = 60 + rnd() * 190
    const grd = g.createRadialGradient(x, y, 0, x, y, r)
    grd.addColorStop(0, 'rgba(55,55,60,0.55)')
    grd.addColorStop(1, 'rgba(55,55,60,0)')
    g.fillStyle = grd
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
  }
  // craters
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * w, y = rnd() * h, r = Math.pow(rnd(), 3) * 26 + 1
    g.fillStyle = `rgba(30,30,34,${0.12 + rnd() * 0.18})`
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
    g.strokeStyle = `rgba(220,220,225,${0.08 + rnd() * 0.15})`
    g.lineWidth = Math.max(0.6, r * 0.18)
    g.beginPath(); g.arc(x - r * 0.12, y - r * 0.12, r, Math.PI * 0.9, Math.PI * 1.9); g.stroke()
  }
  // fine noise
  const img = g.getImageData(0, 0, w, h)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 18
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n
  }
  g.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/**
 * NASA SVS CGI Moon Kit (svs.gsfc.nasa.gov/4720): LRO color map with filled poles, and a
 * normal map derived from the LOLA elevation map (5x vertical exaggeration) for crater shading.
 * Uses the 8k color map when the GPU allows it, otherwise 4k. Falls back to a procedural Moon.
 */
function useMoonTextures() {
  const { gl } = useThree()
  const procedural = useMemo(() => makeProceduralMoon(), [])
  const [map, setMap] = useState<THREE.Texture>(procedural)
  const [normalMap, setNormalMap] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    const loader = new THREE.TextureLoader()
    const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy())
    const big = gl.capabilities.maxTextureSize >= 8192 && !matchMedia('(pointer: coarse)').matches
    let hasSharp = false
    const loadColor = (url: string, sharp: boolean) =>
      loader.load(url, (t) => {
        if (!sharp && hasSharp) return // the 8k map already arrived; keep it
        if (sharp) hasSharp = true
        t.colorSpace = THREE.SRGBColorSpace
        t.anisotropy = aniso
        setMap(t)
      }, undefined, () => {})
    // Show the 4k map fast, then swap in the 8k one if this device can take it.
    loadColor('/textures/moon_color.jpg', false)
    if (big) loadColor('/textures/moon_color_8k.jpg', true)
    loader.load('/textures/moon_normal.jpg', (t) => { t.anisotropy = aniso; setNormalMap(t) }, undefined, () => {})
  }, [gl])
  return { map, normalMap }
}

interface Props {
  site: Site
  sites: Site[]
  idx: number
  /** UTC time of idx; turns Earth to the right side and sets its distance. */
  time: Date
  onSelect: (id: string) => void
}

type ViewKind = 'site' | 'south' | 'north' | 'earth'

interface SceneProps extends Props {
  view: { kind: ViewKind; n: number }
  specs: LabelSpec[]
  els: React.MutableRefObject<Map<string, HTMLDivElement>>
  milkyWay: boolean
}

/** One named feature from the IAU Gazetteer (public/data/moon_features.json). */
export interface MoonFeature {
  name: string
  lat: number
  lon: number
  diameterKm: number
  type: string
  origin: string
}

let featureCache: Promise<MoonFeature[]> | null = null
function loadFeatures(): Promise<MoonFeature[]> {
  featureCache ??= fetch('/data/moon_features.json')
    .then((r) => r.json())
    .then((d: { features: [string, number, number, number, string, string][] }) =>
      d.features.map(([name, lat, lon, diameterKm, type, origin]) => ({ name, lat, lon, diameterKm, type, origin })))
    .catch(() => { featureCache = null; return [] })
  return featureCache
}

/** Loads the feature list the first time names are switched on. */
function useMoonFeatures(enabled: boolean) {
  const [list, setList] = useState<MoonFeature[]>([])
  useEffect(() => { if (enabled && list.length === 0) loadFeatures().then(setList) }, [enabled, list.length])
  return enabled ? list : []
}

// Point-like features (named landing sites) get a nominal size so they still show when zoomed in.
const labelSizeKm = (f: MoonFeature) => (f.type === 'Statio' ? 60 : f.type === 'Mare' || f.type === 'Oceanus' ? Math.max(f.diameterKm, 300) : f.diameterKm)

interface LabelSpec {
  key: string
  pos: THREE.Vector3
  kind: 'feature' | 'site' | 'active'
  text: string
  priority: number
  sizeKm?: number
  onClick?: () => void
}

/** Each frame: hide labels facing away or too far, then place the rest in priority order,
 * nudging site labels around their dot (or hiding a label) so none overlap. The label
 * elements live in a plain HTML overlay above the canvas; this only moves them. */
function LabelLayout({ specs, els }: { specs: LabelSpec[]; els: React.MutableRefObject<Map<string, HTMLDivElement>> }) {
  const { camera, size } = useThree()
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const order = useMemo(() => [...specs].sort((a, b) => b.priority - a.priority), [specs])
  const last = useRef({ m: new Float32Array(16), w: 0, h: 0, specs: specs as LabelSpec[] | null })
  const written = useRef(new Map<string, string>())
  useFrame(() => {
    // Skip the whole pass when neither the camera, the canvas size nor the labels changed.
    const L = last.current
    const m = camera.matrixWorld.elements
    let same = L.specs === specs && L.w === size.width && L.h === size.height
    for (let i = 0; same && i < 16; i++) same = Math.abs(L.m[i] - m[i]) < 1e-7
    if (same) return
    L.m.set(m); L.w = size.width; L.h = size.height; L.specs = specs

    const placed: [number, number, number, number][] = []
    for (const sp of order) {
      const el = els.current.get(sp.key)
      if (!el) continue
      const facing = tmp.copy(camera.position).sub(sp.pos).normalize().dot(sp.pos.clone().normalize())
      const dist = camera.position.distanceTo(sp.pos)
      let o: number
      if (sp.kind === 'feature') {
        // Show a name once its feature would look big enough on screen at this distance.
        const apparent = ((sp.sizeKm ?? 0) / 1737.4) / dist
        o = facing < 0.15 ? 0 : Math.min(1, (facing - 0.15) * 5) * Math.min(1, Math.max(0, (apparent - 0.03) / 0.015))
      } else {
        const maxDist = 3.2
        o = facing < 0.08 || dist > maxDist ? 0 : Math.min(1, (facing - 0.08) * 6) * Math.min(1, (maxDist - dist) * 4)
      }
      let x = -9999, y = -9999
      let dx = 0
      let dy = sp.kind === 'feature' ? 0 : -16
      if (o > 0) {
        const p = tmp.copy(sp.pos).project(camera)
        x = (p.x * 0.5 + 0.5) * size.width
        y = (-p.y * 0.5 + 0.5) * size.height
        const w = sp.text.length * (sp.kind === 'feature' ? 5.6 : 6.8) + (sp.kind === 'feature' ? 6 : 22)
        const h = sp.kind === 'feature' ? 14 : 22
        // Sites may sit above, below, right or left of their dot; features only on their spot.
        const tries: [number, number][] = sp.kind === 'feature'
          ? [[0, 0]]
          : [[0, -16], [0, 16], [w / 2 + 8, 0], [-(w / 2 + 8), 0], [-(w / 2 + 8), -20], [w / 2 + 8, -20], [-(w / 2 + 8), 20], [w / 2 + 8, 20], [0, -40], [0, 40]]
        const hit = (r: number[]) => placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])
        const ok = tries.find(([ox, oy]) => !hit([x + ox - w / 2, y + oy - h / 2, x + ox + w / 2, y + oy + h / 2]))
        if (!ok) o = 0
        else {
          ;[dx, dy] = ok
          placed.push([x + dx - w / 2, y + dy - h / 2, x + dx + w / 2, y + dy + h / 2])
        }
      }
      // Only touch the DOM when something actually changed for this label.
      const key = o === 0 ? '0' : `${Math.round(x + dx)},${Math.round(y + dy)},${o.toFixed(2)}`
      if (written.current.get(sp.key) === key) continue
      written.current.set(sp.key, key)
      if (o === 0) {
        el.style.opacity = '0'
        el.style.pointerEvents = 'none'
      } else {
        el.style.transform = `translate(${x + dx}px, ${y + dy}px) translate(-50%, -50%)`
        el.style.opacity = String(o)
        el.style.pointerEvents = o > 0.3 && sp.onClick ? 'auto' : 'none'
      }
    }
  })
  return null
}

function useLabelSpecs(site: Site, sites: Site[], features: MoonFeature[], onSelect: (id: string) => void, onFeature: (f: MoonFeature) => void) {
  return useMemo<LabelSpec[]>(() => [
    ...features.filter((f) => !sites.some((x) => shortName(x) === f.name)).map((f) => ({
      key: 'f-' + f.name + '@' + f.lat + ',' + f.lon,
      pos: latLonToVec(f.lat, f.lon, 1.002),
      kind: 'feature' as const,
      text: f.name,
      sizeKm: labelSizeKm(f),
      priority: labelSizeKm(f) + (f.type === 'Mons' ? 40 : 0),
      onClick: () => onFeature(f),
    })),
    ...sites.map((x) => ({
      key: 's-' + x.id,
      pos: latLonToVec(x.lat, x.lonEast, 1.003),
      kind: x.id === site.id ? ('active' as const) : ('site' as const),
      text: shortName(x),
      priority: x.id === site.id ? 100000 : 50000,
      onClick: x.id === site.id ? undefined : () => onSelect(x.id),
    })),
  ], [sites, site.id, onSelect, features, onFeature])
}

const FEATURE_TYPE: Record<string, string> = {
  Crater: 'Crater', Mare: 'Mare (lunar sea)', Oceanus: 'Oceanus (ocean)', Mons: 'Mountain', Rima: 'Rille (channel)',
  Dorsum: 'Wrinkle ridge', Vallis: 'Valley', Catena: 'Crater chain', Lacus: 'Lacus (lake)', Sinus: 'Sinus (bay)',
  Palus: 'Palus (marsh)', Promontorium: 'Cape', Rupes: 'Scarp (cliff)', Fossa: 'Trench', Planitia: 'Plain',
  Statio: 'Named landing site', 'Astronaut-named features': 'Astronaut-named feature', 'Albedo Feature': 'Bright/dark marking',
}

const shortName = (x: Site) => x.name.replace(/\s*\(.*\)\s*/, '')

function Scene({ site, sites, idx, time, view, specs, els, milkyWay }: SceneProps) {
  const { map: tex, normalMap } = useMoonTextures()
  const sunRef = useRef<THREE.DirectionalLight>(null)
  const markerRef = useRef<THREE.Group>(null)
  const pulseRef = useRef<THREE.Mesh>(null)
  const { camera } = useThree()
  const controls = useRef<OrbitControlsImpl>(null)
  const flight = useRef({ t: 0, from: new THREE.Vector3(0, 0.4, 3.4), fromTarget: new THREE.Vector3() })

  const sitePos = useMemo(() => latLonToVec(site.lat, site.lonEast, 1.003), [site])
  // Camera sits above the site, looking at the Moon's centre, so dragging spins the whole globe.
  const camTarget = useMemo(() => {
    const polar = Math.abs(site.lat) > 60
    return sitePos.clone().normalize().multiplyScalar(polar ? 1.55 : 2.4)
  }, [sitePos, site.lat])

  const lookTarget = useMemo(() => new THREE.Vector3(0, 0, 0), [])
  const poleViews = useMemo(() => ({
    south: new THREE.Vector3(0.001, -2.6, 0.001),
    north: new THREE.Vector3(0.001, 2.6, 0.001),
  }), [])
  const earthView = useRef(new THREE.Vector3(0, 0, 6))
  const flyTo = useRef(camTarget)
  const lastSite = useRef(site.id)
  const lastViewN = useRef(view.n)
  useEffect(() => {
    // A newly picked site always wins; otherwise go where the last button asked.
    const siteChanged = lastSite.current !== site.id
    const buttonPressed = lastViewN.current !== view.n
    lastSite.current = site.id
    lastViewN.current = view.n
    flyTo.current = siteChanged && !buttonPressed ? camTarget : view.kind === 'site' ? camTarget : view.kind === 'earth' ? earthView.current.clone() : poleViews[view.kind]
    flight.current = { t: 0, from: camera.position.clone(), fromTarget: controls.current?.target.clone() ?? new THREE.Vector3() }
  }, [site.id, camera, view, camTarget, poleViews])



  const s = site.series
  // Unit directions from the Moon's centre, from the Horizons az/el at the selected site.
  const sunDir = useMemo(() => {
    const [la, lo] = subPoint(site.lat, site.lonEast, s.sunAz[idx], s.sunEl[idx])
    return latLonToVec(la, lo, 1)
  }, [site, idx, s])
  const earthDir = useMemo(() => {
    const [la, lo] = subPoint(site.lat, site.lonEast, s.earthAz[idx], s.earthEl[idx])
    return latLonToVec(la, lo, 1)
  }, [site, idx, s])
  // Earth at its real distance, turned the way it really faces the Moon at this time.
  const tMs = time.getTime()
  const earth = useMemo(() => {
    const p = earthPose(new Date(tMs), [earthDir.x, earthDir.y, earthDir.z])
    const north = new THREE.Vector3(...p.north)
    const greenwich = new THREE.Vector3(...p.greenwich)
    // Sphere UVs put 0° longitude on local +x and the north pole on +y (same mapping as latLonToVec).
    const m = new THREE.Matrix4().makeBasis(greenwich, north, new THREE.Vector3().crossVectors(greenwich, north))
    return {
      position: earthDir.clone().multiplyScalar(p.distance),
      quaternion: new THREE.Quaternion().setFromRotationMatrix(m),
      equatorial: p.equatorial,
    }
  }, [tMs, earthDir])
  // How much of Earth's disc is sunlit as seen from the Moon (1 = "full Earth", at new moon).
  const earthLit = (1 - sunDir.dot(earthDir)) / 2
  // "Earth view": stand behind the Moon, a little off the Earth line, so Earth shows beside the limb.
  {
    const side = new THREE.Vector3().crossVectors(earthDir, new THREE.Vector3(0, 1, 0)).normalize()
    earthView.current.copy(earthDir).multiplyScalar(-Math.cos(0.24)).addScaledVector(side, Math.sin(0.24)).multiplyScalar(6.2)
    earthView.current.y += 0.35
  }

  useFrame((state, dt) => {
    const f = flight.current
    if (f.t < 1) {
      // Fly to the site; the user's orbit controls are paused until the flight lands.
      f.t = Math.min(1, f.t + dt / 1.6)
      const k = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2 // ease-in-out-cubic
      camera.position.lerpVectors(f.from, flyTo.current, k)
      if (controls.current) {
        const c = controls.current
        c.enabled = false
        c.target.lerpVectors(f.fromTarget, lookTarget, k)
        c.update() // lets leftover drag momentum decay while we fly
        if (f.t >= 1) {
          // Land exactly on the target with no momentum left, then hand control back.
          c.target.copy(lookTarget)
          camera.position.copy(flyTo.current)
          c.enableDamping = false
          c.update()
          c.enableDamping = true
          c.enabled = true
        }
      } else {
        camera.lookAt(lookTarget)
      }
    }
    sunRef.current?.position.lerp(sunDir, 0.15)
    if (pulseRef.current) {
      const p = (state.clock.elapsedTime % 1.8) / 1.8
      pulseRef.current.scale.setScalar(1 + p * 2.2)
      ;(pulseRef.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - p)
    }
    if (markerRef.current) markerRef.current.lookAt(sitePos.clone().multiplyScalar(2))
  })

  return (
    <>
      <color attach="background" args={['#05070c']} />
      {milkyWay ? <MilkyWay equatorial={earth.equatorial} /> : <StarField />}
      <Sun dir={sunDir} flare />
      <Earth position={earth.position} quaternion={earth.quaternion} sunDir={sunDir} />
      <ambientLight intensity={0.07} />
      {/* Earthshine: sunlight bounced off Earth faintly lights the Moon's night side, more when Earth looks full. */}
      <directionalLight position={earthDir} color="#b4c8ff" intensity={0.45 * earthLit} />
      <directionalLight ref={sunRef} intensity={3.2} color="#fff4e0" position={sunDir} />
      <mesh>
        <sphereGeometry args={[1, 128, 128]} />
        {normalMap ? (
          <meshStandardMaterial map={tex} normalMap={normalMap} normalScale={new THREE.Vector2(1, 1)} roughness={1} metalness={0} />
        ) : (
          <meshStandardMaterial map={tex} roughness={1} metalness={0} bumpMap={tex} bumpScale={0.6} />
        )}
      </mesh>
      <group ref={markerRef} position={sitePos} scale={Math.abs(site.lat) > 60 ? 0.4 : 1}>
        <mesh>
          <circleGeometry args={[0.012, 32]} />
          <meshBasicMaterial color="#3ddc97" />
        </mesh>
        <mesh ref={pulseRef}>
          <ringGeometry args={[0.016, 0.021, 48]} />
          <meshBasicMaterial color="#3ddc97" transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.45}
        zoomSpeed={0.6}
        minDistance={1.08}
        maxDistance={7}
      />
      <LabelLayout specs={specs} els={els} />
      {sites.filter((x) => x.id !== site.id).map((x) => (
        <mesh key={x.id} position={latLonToVec(x.lat, x.lonEast, 1.003)}>
          <sphereGeometry args={[0.0045, 12, 12]} />
          <meshBasicMaterial color="#f1ece2" />
        </mesh>
      ))}
    </>
  )
}

const VIEWS = [
  ['site', 'Recenter on the site', 'Fly back to the selected site'],
  ['south', 'South pole', 'Look straight down on the south pole'],
  ['north', 'North pole', 'Look straight down on the north pole'],
  ['earth', 'Earth view', 'Look past the Moon at Earth: real size, real distance, real phase'],
] as const

/** One "View" menu for the globe: camera presets and the two layers, instead of a row of floating buttons. */
function ViewMenu({ showFeatures, onFeatures, milkyWay, onMilkyWay, go }: {
  showFeatures: boolean; onFeatures: () => void; milkyWay: boolean; onMilkyWay: () => void; go: (k: ViewKind) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', onDown); window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])
  const item = 'flex w-full items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-left text-[13px] font-medium text-[#f1ece2] transition-colors duration-150 hover:bg-white/10'
  const check = (on: boolean) => (
    <span className={`grid h-4 w-7 shrink-0 rounded-full p-0.5 transition-colors duration-150 ${on ? 'bg-[#fbf8f1]' : 'bg-white/20'}`} aria-hidden>
      <span className={`h-3 w-3 rounded-full transition-transform duration-150 ${on ? 'translate-x-3 bg-[#221f1c]' : 'bg-[#f1ece2]'}`} />
    </span>
  )
  return (
    <div ref={root} className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium ring-1 backdrop-blur transition-colors duration-150 active:scale-[0.97] ${open ? 'bg-[#fbf8f1] text-[#221f1c] ring-transparent' : 'bg-[#14120f]/80 text-[#f1ece2] ring-white/15 hover:bg-[#2a2622]'}`}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" /></svg>
        View
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden><path d="M4 6l4 4 4-4" /></svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 w-[240px] rounded-[16px] bg-[#14120f]/92 p-1.5 shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_20px_50px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl">
          <div className="px-3 pb-1 pt-1.5 text-[11px] font-medium text-[#a39c90]">Camera</div>
          {VIEWS.map(([kind, label, title]) => (
            <button key={kind} type="button" role="menuitem" title={title} className={item} onClick={() => { go(kind); setOpen(false) }}>{label}</button>
          ))}
          <div className="mx-3 my-1.5 h-px bg-white/10" />
          <div className="px-3 pb-1 pt-0.5 text-[11px] font-medium text-[#a39c90]">Show</div>
          <button type="button" role="menuitemcheckbox" aria-checked={showFeatures} className={item} onClick={onFeatures}
            title="Official names of craters, seas, mountains and valleys from the IAU Gazetteer (USGS). Zoom in to see more; click a name for details.">
            Moon names {check(showFeatures)}
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={milkyWay} className={item} onClick={onMilkyWay}
            title="Show the real star sky from NASA's star map, Milky Way included, turned to where it really is on this date. Downloads about 1 MB the first time.">
            Milky Way {check(milkyWay)}
          </button>
        </div>
      )}
    </div>
  )
}

const MILKY_WAY_KEY = 'rocky.milkyWay'

/** Milky Way background on or off. Off by default everywhere; the choice is remembered per device. */
function useMilkyWay() {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem(MILKY_WAY_KEY) === '1' } catch { return false }
  })
  const set = (v: boolean) => {
    setOn(v)
    try { localStorage.setItem(MILKY_WAY_KEY, v ? '1' : '0') } catch { /* storage unavailable */ }
  }
  return [on, set] as const
}

export default function MoonScene(props: Props) {
  const [view, setView] = useState<{ kind: ViewKind; n: number }>({ kind: 'site', n: 0 })
  const go = (kind: ViewKind) => setView((v) => ({ kind, n: v.n + 1 }))
  const [showFeatures, setShowFeatures] = useState(false)
  const [milkyWay, setMilkyWay] = useMilkyWay()
  const [picked, setPicked] = useState<MoonFeature | null>(null)
  const features = useMoonFeatures(showFeatures)
  const specs = useLabelSpecs(props.site, props.sites, features, props.onSelect, setPicked)
  const els = useRef(new Map<string, HTMLDivElement>())
  return (
    <div className="relative h-full w-full">
      <Canvas camera={{ position: [0, 0.4, 3.4], fov: 40, near: 0.01, far: 20000 }} dpr={[1, 2]} gl={{ antialias: true }} className="cursor-grab active:cursor-grabbing">
        <Scene {...props} view={view} specs={specs} els={els} milkyWay={milkyWay} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden={false}>
        {specs.map((sp) => (
          <div
            key={sp.key}
            ref={(el) => { if (el) els.current.set(sp.key, el); else els.current.delete(sp.key) }}
            onClick={sp.onClick}
            role={sp.onClick ? 'button' : undefined}
            className={
              'absolute left-0 top-0 ' +
              (sp.kind === 'feature'
                ? 'cursor-pointer select-none whitespace-nowrap text-[10px] tracking-wide text-[#d9d3c7]/85 [text-shadow:0_1px_2px_#000] transition-colors duration-150 hover:text-white'
                : `select-none whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium shadow transition-colors duration-150 ${
                    sp.kind === 'active' ? 'z-20 bg-[#3ddc97] text-[#04140d]' : 'z-10 cursor-pointer bg-[#0e1118]/85 text-[#f1ece2] ring-1 ring-white/15 hover:bg-[#1d2a44]'
                  }`)
            }
            style={{ opacity: 0 }}
          >
            {sp.text}
          </div>
        ))}
      </div>
      {picked && (
        <div
          className="absolute z-30 w-[min(300px,calc(100%-24px))] rounded-[12px] bg-[#16161a]/85 p-3.5 text-[#f5f5f7] shadow-[0_0_0_0.5px_rgba(255,255,255,0.12),0_12px_32px_-8px_rgba(0,0,0,0.7)] backdrop-blur-xl transition-[left,top] duration-200"
          style={{ left: 'calc(var(--map-left, 0px) + 12px)', top: 'calc(var(--map-top, 0px) + 56px)' }}
          role="dialog"
          aria-label={picked.name}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[15px] font-semibold leading-tight">{picked.name}</div>
              <div className="mt-0.5 text-xs text-[#a1a1a6]">{FEATURE_TYPE[picked.type] ?? picked.type}</div>
            </div>
            <button type="button" onClick={() => setPicked(null)} aria-label="Close details" className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#a1a1a6] hover:bg-white/10 hover:text-white">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l8 8M10 2L2 10" /></svg>
            </button>
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {picked.diameterKm > 0 && (<><dt className="text-[#a1a1a6]">Diameter</dt><dd className="tabular">{picked.diameterKm.toLocaleString('en-US', { maximumFractionDigits: 1 })} km</dd></>)}
            <dt className="text-[#a1a1a6]">Location</dt>
            <dd className="tabular">{Math.abs(picked.lat).toFixed(2)}°{picked.lat < 0 ? 'S' : 'N'}, {Math.abs(picked.lon).toFixed(2)}°{picked.lon < 0 ? 'W' : 'E'}</dd>
          </dl>
          {picked.origin && (
            <p className="mt-2.5 border-t border-white/10 pt-2.5 text-xs leading-relaxed text-[#d1d1d6]">
              <span className="text-[#a1a1a6]">Named after: </span>{picked.origin}
            </p>
          )}
          <p className="mt-2 text-[10px] text-[#8e8e93]">Source: IAU Gazetteer of Planetary Nomenclature (USGS)</p>
        </div>
      )}
      <div
        className="pointer-events-none absolute z-20 flex flex-wrap items-center justify-end gap-2 transition-[left,right,top] duration-200"
        style={{
          left: 'calc(var(--map-left, 0px) + 150px)',
          right: 'calc(var(--map-right, 0px) + 12px)',
          top: 'calc(var(--map-top, 0px) + 12px)',
        }}
      >
        <ViewMenu
          showFeatures={showFeatures}
          onFeatures={() => { setShowFeatures((v) => !v); setPicked(null) }}
          milkyWay={milkyWay}
          onMilkyWay={() => setMilkyWay(!milkyWay)}
          go={go}
        />
      </div>
    </div>
  )
}
