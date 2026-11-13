import { OrbitControls, Stars } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { subPoint } from '../lib/engine'
import { SOUTH_POLE_FEATURES } from '../data/features'
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

function useMoonTexture() {
  const procedural = useMemo(() => makeProceduralMoon(), [])
  const [tex, setTex] = useState<THREE.Texture>(procedural)
  useEffect(() => {
    new THREE.TextureLoader().load(
      '/textures/moon_color.jpg',
      (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; setTex(t) },
      undefined,
      () => {} // keep procedural fallback
    )
  }, [])
  return tex
}

interface Props {
  site: Site
  sites: Site[]
  idx: number
  onSelect: (id: string) => void
}

interface SceneProps extends Props {
  recenter: number
  specs: LabelSpec[]
  els: React.MutableRefObject<Map<string, HTMLDivElement>>
}

// Only label features big enough to read at this zoom, plus every mountain.
const LABELLED = SOUTH_POLE_FEATURES.filter((f) => f.diameterKm >= 15 || f.type === 'Mons')

interface LabelSpec {
  key: string
  pos: THREE.Vector3
  kind: 'feature' | 'site' | 'active'
  text: string
  priority: number
  onClick?: () => void
}

/** Each frame: hide labels facing away or too far, then place the rest in priority order,
 * nudging site labels around their dot (or hiding a label) so none overlap. The label
 * elements live in a plain HTML overlay above the canvas; this only moves them. */
function LabelLayout({ specs, els }: { specs: LabelSpec[]; els: React.MutableRefObject<Map<string, HTMLDivElement>> }) {
  const { camera, size } = useThree()
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const order = useMemo(() => [...specs].sort((a, b) => b.priority - a.priority), [specs])
  useFrame(() => {
    const placed: [number, number, number, number][] = []
    for (const sp of order) {
      const el = els.current.get(sp.key)
      if (!el) continue
      const facing = tmp.copy(camera.position).sub(sp.pos).normalize().dot(sp.pos.clone().normalize())
      const dist = camera.position.distanceTo(sp.pos)
      const maxDist = sp.kind === 'feature' ? 0.95 : 3.2
      let o = facing < 0.08 || dist > maxDist ? 0 : Math.min(1, (facing - 0.08) * 6) * Math.min(1, (maxDist - dist) * 4)
      const p = tmp.copy(sp.pos).project(camera)
      const x = (p.x * 0.5 + 0.5) * size.width
      const y = (-p.y * 0.5 + 0.5) * size.height
      let dx = 0
      let dy = sp.kind === 'feature' ? 0 : -16
      if (o > 0) {
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
      el.style.transform = `translate(${x + dx}px, ${y + dy}px) translate(-50%, -50%)`
      el.style.opacity = String(o)
      el.style.pointerEvents = o > 0.3 && sp.onClick ? 'auto' : 'none'
    }
  })
  return null
}

function useLabelSpecs(site: Site, sites: Site[], showFeatures: boolean, onSelect: (id: string) => void) {
  return useMemo<LabelSpec[]>(() => [
    ...(showFeatures ? LABELLED : []).filter((f) => !sites.some((x) => shortName(x) === f.name)).map((f) => ({
      key: 'f-' + f.name, pos: latLonToVec(f.lat, f.lon, 1.002), kind: 'feature' as const, text: f.name,
      priority: (f.type === 'Mons' ? 500 : 0) + f.diameterKm,
    })),
    ...sites.map((x) => ({
      key: 's-' + x.id,
      pos: latLonToVec(x.lat, x.lonEast, 1.003),
      kind: x.id === site.id ? ('active' as const) : ('site' as const),
      text: shortName(x),
      priority: x.id === site.id ? 10000 : 5000,
      onClick: x.id === site.id ? undefined : () => onSelect(x.id),
    })),
  ], [sites, site.id, onSelect, showFeatures])
}

const shortName = (x: Site) => x.name.replace(/\s*\(.*\)\s*/, '')

function Scene({ site, sites, idx, recenter, specs, els }: SceneProps) {
  const tex = useMoonTexture()
  const sunRef = useRef<THREE.DirectionalLight>(null)
  const earthRef = useRef<THREE.Mesh>(null)
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
  const poleView = useMemo(() => new THREE.Vector3(0.001, -2.6, 0.001), [])
  const flyTo = useRef(camTarget)
  useEffect(() => {
    flyTo.current = recenter < 0 ? poleView : camTarget
    flight.current = { t: 0, from: camera.position.clone(), fromTarget: controls.current?.target.clone() ?? new THREE.Vector3() }
  }, [site.id, camera, recenter, camTarget, poleView])



  const s = site.series
  const sunDir = useMemo(() => {
    const [la, lo] = subPoint(site.lat, site.lonEast, s.sunAz[idx], s.sunEl[idx])
    return latLonToVec(la, lo, 10)
  }, [site, idx, s])
  const earthDir = useMemo(() => {
    const [la, lo] = subPoint(site.lat, site.lonEast, s.earthAz[idx], s.earthEl[idx])
    return latLonToVec(la, lo, 4.2)
  }, [site, idx, s])

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
    earthRef.current?.position.lerp(earthDir, 0.15)
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
      <Stars radius={60} depth={30} count={2500} factor={2.2} fade speed={0.3} />
      <ambientLight intensity={0.1} />
      <directionalLight ref={sunRef} intensity={3.2} color="#fff4e0" position={sunDir} />
      <mesh>
        <sphereGeometry args={[1, 128, 128]} />
        <meshStandardMaterial map={tex} roughness={1} metalness={0} bumpMap={tex} bumpScale={0.6} />
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
          <meshBasicMaterial color="#e5e9f1" />
        </mesh>
      ))}
      <mesh ref={earthRef} position={earthDir}>
        <sphereGeometry args={[0.09, 48, 48]} />
        <meshStandardMaterial color="#3b82f6" emissive="#1d4ed8" emissiveIntensity={0.45} roughness={0.6} />
      </mesh>
    </>
  )
}

export default function MoonScene(props: Props) {
  const [recenter, setRecenter] = useState(0)
  const [showFeatures, setShowFeatures] = useState(false)
  const specs = useLabelSpecs(props.site, props.sites, showFeatures, props.onSelect)
  const els = useRef(new Map<string, HTMLDivElement>())
  return (
    <div className="relative h-full w-full">
      <Canvas camera={{ position: [0, 0.4, 3.4], fov: 40, near: 0.01 }} dpr={[1, 2]} gl={{ antialias: true }} className="cursor-grab active:cursor-grabbing">
        <Scene {...props} recenter={recenter} specs={specs} els={els} />
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
                ? 'select-none whitespace-nowrap text-[10px] tracking-wide text-[#c9d1e0]/80 [text-shadow:0_1px_2px_#000]'
                : `select-none whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium shadow transition-colors duration-150 ${
                    sp.kind === 'active' ? 'z-20 bg-[#3ddc97] text-[#04140d]' : 'z-10 cursor-pointer bg-[#0f1626]/85 text-[#e5e9f1] ring-1 ring-white/15 hover:bg-[#1d2a44]'
                  }`)
            }
            style={{ opacity: 0 }}
          >
            {sp.text}
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2">
        <span className="hidden rounded-md bg-[#0f1626]/70 px-2 py-1 text-[11px] text-[#a2adc2] backdrop-blur sm:inline">Drag to rotate, scroll to zoom</span>
        <button
          type="button"
          aria-pressed={showFeatures}
          onClick={() => setShowFeatures((v) => !v)}
          title="Official crater and mountain names from the IAU Gazetteer (USGS)"
          className={`pointer-events-auto rounded-md px-2.5 py-1 text-xs font-medium ring-1 backdrop-blur transition-colors duration-150 active:scale-[0.97] ${
            showFeatures ? 'bg-[#e5e9f1] text-[#0f1626] ring-transparent' : 'bg-[#0f1626]/80 text-[#e5e9f1] ring-white/15 hover:bg-[#1d2a44]'
          }`}
        >
          Crater names
        </button>
        <button
          type="button"
          onClick={() => setRecenter((n) => -Math.abs(n) - 1)}
          title="Look straight down on the south pole"
          className="pointer-events-auto rounded-md bg-[#0f1626]/80 px-2.5 py-1 text-xs font-medium text-[#e5e9f1] ring-1 ring-white/15 backdrop-blur transition-colors duration-150 hover:bg-[#1d2a44] active:scale-[0.97]"
        >
          South pole
        </button>
        <button
          type="button"
          onClick={() => setRecenter((n) => Math.abs(n) + 1)}
          className="pointer-events-auto rounded-md bg-[#0f1626]/80 px-2.5 py-1 text-xs font-medium text-[#e5e9f1] ring-1 ring-white/15 backdrop-blur transition-colors duration-150 hover:bg-[#1d2a44] active:scale-[0.97]"
        >
          Recenter
        </button>
      </div>
    </div>
  )
}
