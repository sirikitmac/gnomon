import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

/**
 * One Moon for the whole "space" part of the landing page. It sits in a sticky layer behind the
 * sections and moves between poses tied to where each section is on the page, rotating and with
 * the sunlight sweeping across it as you scroll.
 *
 * Pose: x, y as a fraction of the viewport (0 = centre), s = scale, sun = light angle (radians;
 * ~2 = crescent lit from the right, ~0 = front-lit, ~-2.3 = crescent from the left), dim = how much
 * a dark veil covers it so text on top stays readable.
 */
type Pose = { x: number; y: number; s: number; sun: number; dim: number }
type Key = { id: string; offset: number; wide: Pose; narrow: Pose }

// `offset` is in viewport heights relative to the top of the element with that id.
const KEYS: Key[] = [
  { id: 'top', offset: 0, wide: { x: 0.2, y: 0, s: 1, sun: 1.95, dim: 0 }, narrow: { x: 0, y: 0.17, s: 0.9, sun: 1.95, dim: 0 } },
  { id: 'statement', offset: -1.05, wide: { x: 0.18, y: 0, s: 1.2, sun: -0.15, dim: 0 }, narrow: { x: 0, y: 0.14, s: 1.05, sun: -0.15, dim: 0 } },
  { id: 'statement', offset: -0.15, wide: { x: 0.02, y: -0.02, s: 1.5, sun: -0.55, dim: 0.74 }, narrow: { x: 0, y: 0, s: 1.25, sun: -0.55, dim: 0.76 } },
  { id: 'compare', offset: 0.15, wide: { x: -0.27, y: 0.02, s: 0.95, sun: -1.05, dim: 0.12 }, narrow: { x: 0, y: -0.2, s: 0.8, sun: -1.05, dim: 0.55 } },
  { id: 'how', offset: 0, wide: { x: 0.34, y: 0.22, s: 0.58, sun: -1.6, dim: 0 }, narrow: { x: 0.18, y: 0.3, s: 0.45, sun: -1.6, dim: 0.35 } },
  { id: 'features', offset: -0.35, wide: { x: 0.47, y: -0.44, s: 1.55, sun: -2.25, dim: 0.25 }, narrow: { x: 0.32, y: -0.52, s: 1.05, sun: -2.25, dim: 0.5 } },
  { id: 'zone-end', offset: -1, wide: { x: 0.45, y: -0.44, s: 1.7, sun: -2.5, dim: 0.25 }, narrow: { x: 0.32, y: -0.52, s: 1.1, sun: -2.5, dim: 0.5 } },
]

const smooth = (t: number) => t * t * (3 - 2 * t)
const mix = (a: Pose, b: Pose, t: number): Pose => ({
  x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s: a.s + (b.s - a.s) * t,
  sun: a.sun + (b.sun - a.sun) * t, dim: a.dim + (b.dim - a.dim) * t,
})

/** Scroll positions (px) of each key, re-measured on resize and layout changes. */
function useKeyPositions() {
  const pos = useRef<number[]>([])
  useEffect(() => {
    const measure = () => {
      const vh = window.innerHeight
      const at = KEYS.map((k) => {
        const el = document.getElementById(k.id)
        const top = el ? el.getBoundingClientRect().top + window.scrollY : 0
        return Math.max(0, top + k.offset * vh)
      })
      for (let i = 1; i < at.length; i++) at[i] = Math.max(at[i], at[i - 1] + 1) // keep order
      pos.current = at
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(document.body)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [])
  return pos
}

function Moon({ veil, reduce }: { veil: React.RefObject<HTMLDivElement | null>; reduce: boolean }) {
  const [color, normal] = useLoader(THREE.TextureLoader, ['/textures/moon_color.jpg', '/textures/moon_normal.jpg'])
  useMemo(() => {
    color.colorSpace = THREE.SRGBColorSpace
    color.anisotropy = 8
    normal.anisotropy = 8
  }, [color, normal])
  const place = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const sun = useRef<THREE.DirectionalLight>(null)
  const { viewport, size } = useThree()
  const narrow = size.width < 768
  const keys = useKeyPositions()
  const cur = useRef<Pose | null>(null)
  const clock = useRef(0)

  useFrame((_, dt) => {
    const at = keys.current
    if (!at.length) return
    const y = window.scrollY
    let target: Pose
    const poses = KEYS.map((k) => (narrow ? k.narrow : k.wide))
    if (y <= at[0]) target = poses[0]
    else if (y >= at[at.length - 1]) target = poses[poses.length - 1]
    else {
      let i = 0
      while (i < at.length - 2 && y > at[i + 1]) i++
      target = mix(poses[i], poses[i + 1], smooth((y - at[i]) / (at[i + 1] - at[i])))
    }
    const k = cur.current ? 1 - Math.exp(-dt * 7) : 1
    const c = (cur.current = cur.current ? mix(cur.current, target, k) : target)
    clock.current += reduce ? 0 : dt

    place.current?.position.set(c.x * viewport.width, c.y * viewport.height, 0)
    place.current?.scale.setScalar(c.s)
    if (spin.current) spin.current.rotation.y = -0.6 + clock.current * 0.025 + y * 0.00028
    const a = c.sun + Math.sin(clock.current * 0.15) * 0.03
    sun.current?.position.set(Math.sin(a) * 5, 1.1, Math.cos(a) * 5)
    if (veil.current) veil.current.style.opacity = String(c.dim)
  })

  const r = narrow ? Math.min(viewport.width * 0.46, 1.25) : 1.32
  return (
    <>
      <ambientLight intensity={0.035} />
      <directionalLight position={[-3, -1, 4]} intensity={0.08} color="#9fb8ff" />
      <directionalLight ref={sun} intensity={3.1} color="#fff3e2" />
      <group ref={place}>
        <group rotation={[0.62, 0, 0.12]}>
          <group ref={spin}>
            <mesh>
              <sphereGeometry args={[r, 160, 160]} />
              <meshStandardMaterial map={color} normalMap={normal} normalScale={new THREE.Vector2(1.2, 1.2)} roughness={1} metalness={0} />
            </mesh>
          </group>
        </group>
      </group>
    </>
  )
}

function Stars() {
  const geo = useMemo(() => {
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const n = 900
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) pos.set([(rnd() - 0.5) * 30, (rnd() - 0.5) * 18, -6 - rnd() * 8], i * 3)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [])
  const ref = useRef<THREE.Points>(null)
  // a little parallax: stars drift slower than the page
  useFrame(() => { if (ref.current) ref.current.position.y = (window.scrollY / window.innerHeight) * 0.35 })
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={1.3} sizeAttenuation={false} color="#d9d6cf" transparent opacity={0.55} depthWrite={false} />
    </points>
  )
}

/** Sticky full-screen layer: render it first inside the zone; it adds no height to the page. */
export default function MoonStage({ reduce }: { reduce: boolean }) {
  const veil = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '100px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={box} className="pointer-events-none sticky top-0 -mb-[100svh] h-[100svh] overflow-hidden" aria-hidden>
      <Canvas
        frameloop={visible ? 'always' : 'never'}
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 5.2], fov: 32 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <Stars />
        <Suspense fallback={null}>
          <Moon veil={veil} reduce={reduce} />
        </Suspense>
      </Canvas>
      <div ref={veil} className="absolute inset-0 bg-[#07090d]" style={{ opacity: 0 }} />
    </div>
  )
}
