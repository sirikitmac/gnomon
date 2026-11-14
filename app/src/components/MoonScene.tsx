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
export function latLonToVec(lat: number, lon: number, r = 1): THREE.Vector3 {
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
export function useMoonTextures() {
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

/** The opening spin plays once per page load, the first time the globe appears. */
let introPlayed = false
const INTRO_SECONDS = 5

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
  // Opening shot: start far out, spin round the whole Moon, then settle over the selected site.
  const intro = useRef<{ t: number } | null>(
    introPlayed || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) ? null : { t: 0 },
  )
  const lastSite = useRef(site.id)
  const lastViewN = useRef(view.n)
  useEffect(() => {
    // A newly picked site always wins; otherwise go where the last button asked.
    const siteChanged = lastSite.current !== site.id
    const buttonPressed = lastViewN.current !== view.n
    lastSite.current = site.id
    lastViewN.current = view.n
    if (intro.current && (siteChanged || buttonPressed)) { intro.current = null; introPlayed = true }
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

  // Grabbing the Moon during the opening spin hands control straight over.
  const { gl } = useThree()
  useEffect(() => {
    const el = gl.domElement
    const stop = () => {
      if (!intro.current) return
      intro.current = null
      introPlayed = true
      flight.current.t = 1
      const c = controls.current
      if (c) { c.target.set(0, 0, 0); c.enabled = true }
    }
    el.addEventListener('pointerdown', stop)
    el.addEventListener('wheel', stop, { passive: true })
    return () => { el.removeEventListener('pointerdown', stop); el.removeEventListener('wheel', stop) }
  }, [gl])

  useFrame((state, dt) => {
    const f = flight.current
    const it = intro.current
    if (it) {
      // Clamp the step: a slow first frame (textures decoding) must not skip the whole spin.
      it.t = Math.min(1, it.t + Math.min(dt, 1 / 30) / INTRO_SECONDS)
      const F = flyTo.current
      const rF = F.length(), pF = Math.acos(F.y / rF), aF = Math.atan2(F.x, F.z)
      // First half: the whole Moon turns in front of you. Second half: dive in and settle over the site.
      const u = Math.max(0, Math.min(1, (it.t - 0.42) / 0.58))
      const k = u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2 // ease-in-out-cubic
      const spin = 1 - (1 - it.t) ** 2.2 // already turning on the first frame, slowing to a stop
      const r = 7.2 * (rF / 7.2) ** k // log-space zoom reads as a steady dolly
      const pol = 1.22 + (pF - 1.22) * k // from just above the equator down to the site
      // Start on the sunlit side (the Sun is real for this date), so the turn shows the lit Moon, then
      // swing round to the site. Always turn at least a quarter, so it reads as a globe.
      const aSun = Math.atan2(sunDir.x, sunDir.z)
      let d = ((aF - aSun + 3 * Math.PI) % (2 * Math.PI)) - Math.PI
      if (Math.abs(d) < Math.PI / 2) d = (d < 0 ? -1 : 1) * (Math.PI / 2)
      const az = aF - d * (1 - spin)
      camera.position.set(r * Math.sin(pol) * Math.sin(az), r * Math.cos(pol), r * Math.sin(pol) * Math.cos(az))
      const c = controls.current
      if (c) {
        c.enabled = false
        c.target.set(0, 0, 0)
        c.update()
      } else {
        camera.lookAt(lookTarget)
      }
      if (it.t >= 1) {
        camera.position.copy(F)
        if (c) {
          c.enableDamping = false
          c.update()
          c.enableDamping = true
          c.enabled = true
        }
        intro.current = null
        introPlayed = true
        f.t = 1
      }
    } else if (f.t < 1) {
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
        <span className="hidden rounded-full bg-[#0e1118]/70 px-3 py-1 text-[11px] text-[#b3ac9f] backdrop-blur xl:inline">Drag to rotate, scroll to zoom</span>
        <button
          type="button"
          aria-pressed={showFeatures}
          onClick={() => { setShowFeatures((v) => !v); setPicked(null) }}
          title="Official names of craters, seas, mountains and valleys from the IAU Gazetteer (USGS). Zoom in to see more; click a name for details."
          className={`pointer-events-auto rounded-full px-3 py-1 text-xs font-medium ring-1 backdrop-blur transition-colors duration-150 active:scale-[0.97] ${
            showFeatures ? 'bg-[#fbf8f1] text-[#221f1c] ring-transparent' : 'bg-[#0e1118]/80 text-[#f1ece2] ring-white/15 hover:bg-[#1d2a44]'
          }`}
        >
          Moon names
        </button>
        <button
          type="button"
          aria-pressed={milkyWay}
          onClick={() => setMilkyWay(!milkyWay)}
          title="Show the real star sky from NASA's star map, Milky Way included, turned to where it really is on this date. Downloads about 1 MB the first time."
          className={`pointer-events-auto rounded-full px-3 py-1 text-xs font-medium ring-1 backdrop-blur transition-colors duration-150 active:scale-[0.97] ${
            milkyWay ? 'bg-[#fbf8f1] text-[#221f1c] ring-transparent' : 'bg-[#0e1118]/80 text-[#f1ece2] ring-white/15 hover:bg-[#1d2a44]'
          }`}
        >
          Milky Way
        </button>
        {([['north', 'North pole', 'Look straight down on the north pole'], ['south', 'South pole', 'Look straight down on the south pole'], ['earth', 'Earth view', 'Look past the Moon at Earth: real size, real distance, real phase'], ['site', 'Recenter', 'Fly back to the selected site']] as const).map(([kind, label, title]) => (
          <button
            key={kind}
            type="button"
            title={title}
            onClick={() => go(kind)}
            className="pointer-events-auto rounded-full bg-[#0e1118]/80 px-3 py-1 text-xs font-medium text-[#f1ece2] ring-1 ring-white/15 backdrop-blur transition-colors duration-150 hover:bg-[#1d2a44] active:scale-[0.97]"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
