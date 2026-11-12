import { Stars } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { subPoint } from '../lib/engine'
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

function useMoonTexture() {
  const procedural = useMemo(makeProceduralMoon, [])
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
  idx: number
}

function Scene({ site, idx }: Props) {
  const tex = useMoonTexture()
  const sunRef = useRef<THREE.DirectionalLight>(null)
  const earthRef = useRef<THREE.Mesh>(null)
  const markerRef = useRef<THREE.Group>(null)
  const pulseRef = useRef<THREE.Mesh>(null)
  const { camera } = useThree()
  const flight = useRef({ t: 0, from: new THREE.Vector3(0, 0.4, 3.4) })

  const sitePos = useMemo(() => latLonToVec(site.lat, site.lonEast, 1.003), [site])
  const camTarget = useMemo(() => {
    const out = sitePos.clone().normalize().multiplyScalar(2.35)
    // lift the view slightly off the surface normal so the limb and terminator stay in frame
    return out.add(new THREE.Vector3(0, site.lat < -60 ? -0.35 : 0.35, 0.25))
  }, [sitePos, site.lat])

  useEffect(() => {
    flight.current = { t: 0, from: camera.position.clone() }
  }, [site.id, camera])

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
      f.t = Math.min(1, f.t + dt / 1.6)
      const k = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2 // ease-in-out-cubic
      camera.position.lerpVectors(f.from, camTarget, k)
    } else {
      // gentle idle drift around the target
      const tt = state.clock.elapsedTime * 0.15
      camera.position.lerp(camTarget.clone().add(new THREE.Vector3(Math.sin(tt) * 0.05, Math.cos(tt) * 0.03, 0)), 0.02)
    }
    camera.lookAt(sitePos.clone().multiplyScalar(0.6))
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
      <group ref={markerRef} position={sitePos}>
        <mesh>
          <circleGeometry args={[0.012, 32]} />
          <meshBasicMaterial color="#3ddc97" />
        </mesh>
        <mesh ref={pulseRef}>
          <ringGeometry args={[0.016, 0.021, 48]} />
          <meshBasicMaterial color="#3ddc97" transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <mesh ref={earthRef} position={earthDir}>
        <sphereGeometry args={[0.09, 48, 48]} />
        <meshStandardMaterial color="#3b82f6" emissive="#1d4ed8" emissiveIntensity={0.45} roughness={0.6} />
      </mesh>
    </>
  )
}

export default function MoonScene(props: Props) {
  return (
    <Canvas camera={{ position: [0, 0.4, 3.4], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true }}>
      <Scene {...props} />
    </Canvas>
  )
}
