import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import type { MotionValue } from 'framer-motion'
import { Suspense, useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * The landing hero: the real Moon (NASA CGI Moon Kit color + LOLA-derived relief), tilted so the
 * south pole faces us. Scrolling sweeps the sunlight across it — the page acts out what Lunalit
 * computes. `progress` is the hero's scroll progress (0..1).
 */
function Moon({ progress, reduce }: { progress: MotionValue<number>; reduce: boolean }) {
  const [color, normal] = useLoader(THREE.TextureLoader, ['/textures/moon_color.jpg', '/textures/moon_normal.jpg'])
  useMemo(() => {
    color.colorSpace = THREE.SRGBColorSpace
    color.anisotropy = 8
    normal.anisotropy = 8
  }, [color, normal])
  const spin = useRef<THREE.Group>(null)
  const sun = useRef<THREE.DirectionalLight>(null)
  const { viewport, size } = useThree()
  const narrow = size.width < 768
  const t0 = useRef(0)

  useFrame((_, dt) => {
    const p = progress.get()
    t0.current += reduce ? 0 : dt
    if (spin.current) {
      spin.current.rotation.y = -0.6 + t0.current * 0.025 + p * 0.5
      const s = 1 + p * 0.22
      spin.current.scale.setScalar(s)
    }
    // Sun: starts low on the right (a thin crescent), sweeps round to light the near side.
    const a = 1.95 - p * 2.1 + Math.sin(t0.current * 0.15) * 0.04
    sun.current?.position.set(Math.sin(a) * 5, 0.9 + p * 0.8, Math.cos(a) * 5)
  })

  const r = narrow ? Math.min(viewport.width * 0.46, 1.25) : 1.32
  return (
    <>
      <ambientLight intensity={0.035} />
      {/* earthshine, faint and bluish on the night side */}
      <directionalLight position={[-3, -1, 4]} intensity={0.08} color="#9fb8ff" />
      <directionalLight ref={sun} intensity={3.1} color="#fff3e2" />
      <group position={narrow ? [0, 0.62, 0] : [viewport.width * 0.2, 0.05, 0]}>
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
  return (
    <points geometry={geo}>
      <pointsMaterial size={1.3} sizeAttenuation={false} color="#d9d6cf" transparent opacity={0.55} depthWrite={false} />
    </points>
  )
}

export default function HeroMoon({ progress, reduce }: { progress: MotionValue<number>; reduce: boolean }) {
  return (
    <Canvas
      className="!absolute inset-0"
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 5.2], fov: 32 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      aria-hidden
    >
      <Stars />
      <Suspense fallback={null}>
        <Moon progress={progress} reduce={reduce} />
      </Suspense>
    </Canvas>
  )
}
