import { Html, Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { moonEcliptic, orbitPose, MOON_RADIUS_KM, type V3 } from '../lib/earthOrient'
import { fmtDate, idxToDate, subPoint } from '../lib/engine'
import type { Dataset, Site } from '../lib/types'
import { latLonToVec, useMoonTextures } from './MoonScene'
import { EARTH_RADIUS, Earth, StarField, Sun } from './SkyBodies'

/**
 * Orbit view: the Earth–Moon–Sun system from outside, as a timelapse.
 * Sizes are true (Moon radius = 1 unit, Earth 3.67); the Earth–Moon distance is squeezed so both
 * fit on screen. The Moon's path and turn come from the app's Meeus model (earthOrient.ts); the Sun
 * and Earth as seen from the landing site come from the same JPL Horizons data as the rest of the app.
 */

const SQUEEZE = 12
const SPEEDS = [
  { id: 'day', label: '1 day/s', daysPerSec: 1 },
  { id: 'week', label: '1 week/s', daysPerSec: 7 },
] as const
type SpeedId = (typeof SPEEDS)[number]['id']
const LOOP_DAYS = 30

/** Ecliptic (z up) → scene (y up). */
const toScene = (p: V3, k = 1) => new THREE.Vector3(p[0] * k, p[2] * k, -p[1] * k)

const azElToVec = (site: Site, az: number, el: number): V3 => {
  const [la, lo] = subPoint(site.lat, site.lonEast, az, el)
  const v = latLonToVec(la, lo, 1)
  return [v.x, v.y, v.z]
}

/** Moon-fixed direction to Earth at a fractional data index, from the site's Horizons az/el. */
function earthDirAt(site: Site, f: number): V3 {
  const s = site.series
  const n = s.earthAz.length
  const i = Math.max(0, Math.min(n - 2, Math.floor(f)))
  const k = Math.max(0, Math.min(1, f - i))
  const a = azElToVec(site, s.earthAz[i], s.earthEl[i])
  const b = azElToVec(site, s.earthAz[i + 1], s.earthEl[i + 1])
  const v = new THREE.Vector3(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k).normalize()
  return [v.x, v.y, v.z]
}

interface State { f: number; playing: boolean; speed: SpeedId; loop: [number, number] }

function System({ ds, site, st, follow, range }: { ds: Dataset; site: Site; st: React.MutableRefObject<State>; follow: boolean; range: [number, number] }) {
  const { map, normalMap } = useMoonTextures()
  const { camera } = useThree()
  const controls = useRef<OrbitControlsImpl>(null)
  const moon = useRef<THREE.Group>(null)
  const sunLight = useRef<THREE.DirectionalLight>(null)
  const siteDot = useRef<THREE.Mesh>(null)
  const siteMat = useRef<THREE.MeshBasicMaterial>(null)
  // Live objects the frame loop mutates; the Sun and Earth components read them every frame.
  const pose0 = useMemo(() => frame(ds, site, st.current.f), []) // eslint-disable-line react-hooks/exhaustive-deps
  const live = useMemo(() => ({ sunDir: pose0.sunDir.clone(), earthQuat: pose0.earthQuat.clone() }), [pose0])
  const beamGeo = useMemo(() => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3)), [])
  const beamMat = useRef<THREE.LineBasicMaterial>(null)
  const beamObj = useMemo(() => new THREE.Line(beamGeo), [beamGeo])
  const sitePos = useMemo(() => latLonToVec(site.lat, site.lonEast, 1.004), [site])
  const stepsPerSec = (d: number) => (d * 24) / ds.meta.stepHours

  // The Moon's path over the loop, and the mission part of it, drawn as lines.
  const paths = useMemo(() => {
    const t0 = idxToDate(ds, st.current.loop[0]).getTime()
    const pts: THREE.Vector3[] = []
    for (let h = 0; h <= LOOP_DAYS * 24; h += 3) {
      const m = moonEcliptic(new Date(t0 + h * 3_600_000))
      const lat = m.lat * (Math.PI / 180), lon = m.lon * (Math.PI / 180), r = m.km / MOON_RADIUS_KM / SQUEEZE
      pts.push(toScene([Math.cos(lat) * Math.cos(lon) * r, Math.cos(lat) * Math.sin(lon) * r, Math.sin(lat) * r]))
    }
    const mission: THREE.Vector3[] = []
    for (let i = range[0]; i <= range[1]; i += 1) {
      const m = moonEcliptic(idxToDate(ds, i))
      const lat = m.lat * (Math.PI / 180), lon = m.lon * (Math.PI / 180), r = m.km / MOON_RADIUS_KM / SQUEEZE
      mission.push(toScene([Math.cos(lat) * Math.cos(lon) * r, Math.cos(lat) * Math.sin(lon) * r, Math.sin(lat) * r]))
    }
    return { orbit: pts, mission }
  }, [ds, range, st])

  const flyFrom = useRef<{ t: number; pos: THREE.Vector3; target: THREE.Vector3 } | null>(null)
  useEffect(() => {
    flyFrom.current = { t: 0, pos: camera.position.clone(), target: controls.current?.target.clone() ?? new THREE.Vector3() }
  }, [follow, camera])

  useFrame((_, dt) => {
    const s = st.current
    if (s.playing) {
      const sp = SPEEDS.find((x) => x.id === s.speed)!
      s.f += Math.min(dt, 0.1) * stepsPerSec(sp.daysPerSec)
      if (s.f > s.loop[1]) s.f = s.loop[0]
    }
    const p = frame(ds, site, s.f)
    if (moon.current) {
      moon.current.position.copy(p.moonPos)
      moon.current.quaternion.copy(p.moonQuat)
    }
    sunLight.current?.position.copy(p.sunDir)
    live.sunDir.copy(p.sunDir)
    live.earthQuat.copy(p.earthQuat)
    const i = Math.max(0, Math.min(site.series.sunVis.length - 1, Math.round(s.f)))
    const lit = !!site.series.sunVis[i]
    siteMat.current?.color.set(lit ? '#ffcf4d' : '#6b6560')
    const world = sitePos.clone().applyQuaternion(p.moonQuat).add(p.moonPos)
    if (siteDot.current) siteDot.current.scale.setScalar(1 + 0.25 * Math.sin(performance.now() / 300))

    // Camera: whole system, or riding along with the Moon.
    const target = follow ? p.moonPos : new THREE.Vector3()
    const c = controls.current
    if (c) {
      const fl = flyFrom.current
      if (fl && fl.t < 1) {
        fl.t = Math.min(1, fl.t + dt / 1.4)
        const k = fl.t < 0.5 ? 4 * fl.t ** 3 : 1 - (-2 * fl.t + 2) ** 3 / 2
        // Following: look at the Moon from the side, a little below, so the day/night line crosses the south pole.
        const side = new THREE.Vector3().crossVectors(p.sunDir, UP).normalize()
        const goal = follow
          ? p.moonPos.clone().add(side.multiplyScalar(8)).add(p.sunDir.clone().multiplyScalar(2)).add(new THREE.Vector3(0, -4.5, 0))
          : HOME.clone()
        camera.position.lerpVectors(fl.pos, goal, k)
        c.target.lerpVectors(fl.target, target, k)
      } else if (follow) {
        const delta = target.clone().sub(c.target)
        c.target.add(delta)
        camera.position.add(delta)
      }
      c.update()
    }
    // Line of sight from the landing site to Earth: green when Earth clears the site's skyline, red when it doesn't.
    const pos = beamGeo.attributes.position as THREE.BufferAttribute
    pos.setXYZ(0, world.x, world.y, world.z); pos.setXYZ(1, 0, 0, 0); pos.needsUpdate = true
    if (beamMat.current) beamMat.current.color.set(site.series.earthVis[i] ? '#3ddc97' : '#ff6961')
  })

  const earthAxis = pose0.earthNorth.clone().multiplyScalar(EARTH_RADIUS * 1.6)
  return (
    <>
      <color attach="background" args={['#05070c']} />
      <StarField />
      <Sun dir={live.sunDir} flare />
      <ambientLight intensity={0.06} />
      <directionalLight ref={sunLight} intensity={3} color="#fff4e0" />
      <Earth position={ORIGIN} quaternion={live.earthQuat} sunDir={live.sunDir} />

      {/* Earth's axis, 23.4° from the ecliptic pole */}
      <Line points={[earthAxis.clone().negate(), earthAxis]} color="#7fb2ff" lineWidth={1.5} dashed dashSize={0.4} gapSize={0.25} />

      <Line points={paths.orbit} color="#f1ece2" lineWidth={1} transparent opacity={0.22} />
      {paths.mission.length > 1 && <Line points={paths.mission} color="#3ddc97" lineWidth={2.5} />}

      <group ref={moon}>
        <mesh>
          <sphereGeometry args={[1, 96, 96]} />
          {normalMap
            ? <meshStandardMaterial map={map} normalMap={normalMap} roughness={1} metalness={0} />
            : <meshStandardMaterial map={map} roughness={1} metalness={0} />}
        </mesh>
        {/* The Moon's spin axis: local +y */}
        <Line points={[[0, -2.1, 0], [0, 2.1, 0]]} color="#ffcf4d" lineWidth={2} />
        <mesh ref={siteDot} position={sitePos}>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshBasicMaterial ref={siteMat} color="#ffcf4d" toneMapped={false} />
        </mesh>
      </group>

      <primitive object={beamObj}>
        <lineBasicMaterial ref={beamMat} attach="material" color="#3ddc97" transparent opacity={0.9} />
      </primitive>

      <Html position={[0, EARTH_RADIUS + 1.6, 0]} center className="pointer-events-none select-none whitespace-nowrap rounded-full bg-[#14120f]/75 px-2 py-0.5 text-[11px] font-medium text-[#f1ece2]">Earth</Html>
      <SunLabel dir={live.sunDir} />
      <Follow target={moon}>
        <Html position={[0, -2.6, 0]} center className="pointer-events-none select-none whitespace-nowrap rounded-full bg-[#14120f]/75 px-2 py-0.5 text-[11px] font-medium text-[#f1ece2]">Moon</Html>
      </Follow>
      {/* The Moon's axis stays within ~1.5° of straight up in this frame, so the tag can sit above it. */}
      <Follow target={moon}>
        <Html position={[0, 2.5, 0]} center className="pointer-events-none select-none whitespace-nowrap text-[10px] font-medium text-[#ffcf4d] [text-shadow:0_1px_2px_#000]">Spin axis</Html>
      </Follow>

      <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={0.08} rotateSpeed={0.5} minDistance={3} maxDistance={140} />
    </>
  )
}

const ORIGIN = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)
const HOME = new THREE.Vector3(0, 30, 50)

/** Keeps its children at another object's position, without turning with it (for labels). */
function Follow({ target, children }: { target: React.RefObject<THREE.Object3D | null>; children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null)
  useFrame(() => { if (g.current && target.current) g.current.position.copy(target.current.position) })
  return <group ref={g}>{children}</group>
}

/** "Sun" tag a little way out along the Sun's direction (the Sun itself is far off screen most of the time). */
function SunLabel({ dir }: { dir: THREE.Vector3 }) {
  const g = useRef<THREE.Group>(null)
  useFrame(() => { g.current?.position.copy(dir).multiplyScalar(30) })
  return (
    <group ref={g}>
      <Html center className="pointer-events-none select-none whitespace-nowrap rounded-full bg-[#14120f]/75 px-2 py-0.5 text-[11px] font-medium text-[#ffcf4d]">Sun</Html>
    </group>
  )
}

/** Everything that moves, at a fractional data index. */
function frame(ds: Dataset, site: Site, f: number) {
  const t = new Date(Date.parse(ds.meta.start) + f * ds.meta.stepHours * 3_600_000)
  const o = orbitPose(t, earthDirAt(site, f))
  const moonPos = toScene(o.moonPos, 1 / SQUEEZE)
  // Moon-fixed basis vectors (x, y = north pole, z) in the scene frame → the Moon's rotation.
  const ex = toScene(o.moonToEcl([1, 0, 0])), ey = toScene(o.moonToEcl([0, 1, 0])), ez = toScene(o.moonToEcl([0, 0, 1]))
  const moonQuat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez))
  const g = toScene(o.earthGreenwich), n = toScene(o.earthNorth)
  const earthQuat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(g, n, new THREE.Vector3().crossVectors(g, n)))
  return { t, moonPos, moonQuat, moonPole: ey, sunDir: toScene(o.sun), earthQuat, earthNorth: n, tilt: o.moonTiltDeg, km: o.moonKm }
}

export default function OrbitScene({ ds, site, cursor, range, onCursor, onPlayingChange }: {
  ds: Dataset
  site: Site
  cursor: number
  /** Mission index range [landing, end): highlighted on the Moon's path. */
  range: [number, number]
  onCursor: (i: number) => void
  /** Lets the dashboard show "so far" numbers while the timelapse plays. */
  onPlayingChange?: (playing: boolean) => void
}) {
  const loopEnd = Math.min(ds.meta.count - 2, range[0] + Math.round((LOOP_DAYS * 24) / ds.meta.stepHours))
  const st = useRef<State>({ f: cursor, playing: false, speed: 'day', loop: [range[0], loopEnd] })
  st.current.loop = [range[0], loopEnd]
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<SpeedId>('day')
  const [follow, setFollow] = useState(false)
  const [hud, setHud] = useState(() => hudAt(st.current.f))

  // The dashboard's mission time moves the timelapse when it is paused.
  useEffect(() => { if (!st.current.playing) { st.current.f = cursor; setHud(hudAt(cursor)) } }, [cursor]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playing) return
    // While playing, the rest of the dashboard (timeline cursor, T+, Sun/Earth countdowns, the bars at
    // the top) follows the timelapse a few times a second, for as long as it is inside the mission.
    let lastSent = -1
    const id = setInterval(() => {
      const h = hudAt(st.current.f)
      setHud(h)
      const i = Math.max(range[0], Math.min(range[1] - 1, h.i))
      if (i !== lastSent) { lastSent = i; onCursor(i) }
    }, 120)
    return () => clearInterval(id)
  }, [playing]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onPlayingChange?.(playing) }, [playing, onPlayingChange])
  useEffect(() => () => onPlayingChange?.(false), [onPlayingChange])

  function hudAt(f: number) {
    const i = Math.max(0, Math.min(site.series.sunVis.length - 1, Math.round(f)))
    return {
      i,
      date: fmtDate(idxToDate(ds, i)),
      sunEl: site.series.sunEl[i],
      sunUp: !!site.series.sunVis[i],
      earthUp: !!site.series.earthVis[i],
      inMission: i >= range[0] && i < range[1],
      day: (i - range[0]) * ds.meta.stepHours / 24,
    }
  }

  const toggle = () => {
    const next = !playing
    if (next && (st.current.f < range[0] || st.current.f >= st.current.loop[1])) st.current.f = range[0]
    st.current.playing = next
    setPlaying(next)
    if (!next) {
      const i = Math.round(st.current.f)
      if (i >= range[0] && i < range[1]) onCursor(i)
      setHud(hudAt(st.current.f))
    }
  }
  const chooseSpeed = (s: SpeedId) => { st.current.speed = s; setSpeed(s) }

  const pill = 'rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150'
  return (
    <div className="relative h-full w-full">
      <Canvas camera={{ position: [0, 30, 50], fov: 40, near: 0.05, far: 20000 }} dpr={[1, 2]} gl={{ antialias: true }} className="cursor-grab active:cursor-grabbing">
        <System ds={ds} site={site} st={st} follow={follow} range={range} />
      </Canvas>

      {/* Camera choice, top right */}
      <div className="absolute z-20 flex rounded-full bg-[#14120f]/80 p-0.5 ring-1 ring-white/15 backdrop-blur" role="radiogroup" aria-label="Orbit camera"
        style={{ right: 'calc(var(--map-right, 0px) + 12px)', top: 'calc(var(--map-top, 0px) + 12px)' }}>
        {([[false, 'Whole orbit'], [true, 'Follow the Moon']] as const).map(([v, label]) => (
          <button key={label} type="button" role="radio" aria-checked={follow === v} onClick={() => setFollow(v)}
            className={`${pill} ${follow === v ? 'bg-[#fbf8f1] text-[#221f1c]' : 'text-[#d9d3c7] hover:text-white'}`}>{label}</button>
        ))}
      </div>

      {/* What the landing site sees right now, top left under the view switch */}
      <div className="pointer-events-none absolute z-20 w-[250px] rounded-[14px] bg-[#14120f]/80 p-3 text-[12px] text-[#d9d3c7] ring-1 ring-white/10 backdrop-blur"
        style={{ left: 'calc(var(--map-left, 0px) + 32px)', top: 'calc(var(--map-top, 0px) + 56px)' }}>
        <div className="font-medium text-[#f1ece2] tabular">{hud.date}</div>
        <div className="mt-0.5 text-[11px] text-[#a39c90] tabular">
          {hud.inMission ? `Mission day ${Math.floor(hud.day) + 1}` : hud.day < 0 ? 'Before landing' : 'After the mission'} · {site.name.replace(/\s*\(.*\)\s*/, '')}
        </div>
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 tabular">
          <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${hud.sunUp ? 'bg-[#ffcf4d]' : 'bg-[#6b6560]'}`} />Sun</span>
          <span className="text-right">{hud.sunUp ? 'in view' : 'behind the ridge'}</span>
          <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${hud.earthUp ? 'bg-[#3ddc97]' : 'bg-[#ff6961]'}`} />Earth</span>
          <span className="text-right">{hud.earthUp ? 'in view' : 'behind the ridge'}</span>
          <span className="text-[#a39c90]" title="The Sun's height above a flat, level horizon. Malapert is a tall massif, so from its top the Sun can still be seen a little below that line.">Sun height</span>
          <span className="text-right text-[#a39c90]">{hud.sunEl >= 0 ? '+' : '−'}{Math.abs(hud.sunEl).toFixed(1)}°</span>
        </div>
        <div className="mt-2 border-t border-white/10 pt-2 text-[10.5px] leading-snug text-[#8f887d]"
          title="The Moon's path is from a simplified model; the Sun and Earth seen from the site come from JPL Horizons.">
          Sizes true, Earth–Moon distance squeezed {SQUEEZE}× so both fit
        </div>
      </div>

      {/* Timelapse controls, bottom centre */}
      <div className="absolute z-20 flex justify-center"
        style={{ left: 'var(--map-left, 0px)', right: 'var(--map-right, 0px)', bottom: 'calc(var(--map-bottom, 0px) + 40px)' }}>
        <div className="flex items-center gap-1.5 rounded-full bg-[#14120f]/85 p-1 ring-1 ring-white/15 backdrop-blur">
          <button type="button" onClick={toggle} aria-pressed={playing}
            className="flex h-9 items-center gap-2 rounded-full bg-[#fbf8f1] px-4 text-[13px] font-semibold text-[#221f1c] transition-transform duration-150 active:scale-[0.97]">
            {playing
              ? <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor" /><rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor" /></svg>
              : <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M3 1.8v8.4a.6.6 0 00.9.5l7-4.2a.6.6 0 000-1L3.9 1.3a.6.6 0 00-.9.5z" fill="currentColor" /></svg>}
            {playing ? 'Pause' : 'Play timelapse'}
          </button>
          {SPEEDS.map((s) => (
            <button key={s.id} type="button" aria-pressed={speed === s.id} onClick={() => chooseSpeed(s.id)}
              className={`${pill} ${speed === s.id ? 'bg-white/15 text-white' : 'text-[#d9d3c7] hover:text-white'}`}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* Legend, bottom left */}
      <div className="pointer-events-none absolute z-10 flex max-w-[40%] flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#b3ac9f]"
        style={{ left: 'calc(var(--map-left, 0px) + 32px)', bottom: 'calc(var(--map-bottom, 0px) + 12px)' }}>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[#3ddc97]" />Mission</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[#ffcf4d]" />Moon's axis</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[#7fb2ff]" />Earth's axis</span>
      </div>
    </div>
  )
}
