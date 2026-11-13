import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { EARTH_RADIUS_KM, MOON_RADIUS_KM, type V3 } from '../lib/earthOrient'

/** Earth's true size in Moon radii (the scene's unit). */
export const EARTH_RADIUS = EARTH_RADIUS_KM / MOON_RADIUS_KM
/** The Sun's apparent angular radius, about 0.27° (it varies ±1.7% over the year). */
const SUN_ANGULAR_RADIUS = 0.2666 * (Math.PI / 180)
/**
 * The real Sun is ~86,000 Moon radii away. We draw it nearer (but still far beyond Earth) at its
 * true apparent size, so it looks right without straining the depth buffer.
 */
export const SUN_DRAW_DISTANCE = 6000

const earthVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDirW = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const earthFrag = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D cloudMap;
  uniform vec3 sunDir;
  uniform float hasNight;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  void main() {
    vec3 n = normalize(vNormalW);
    float mu = dot(n, normalize(sunDir));
    float lit = clamp(mu, 0.0, 1.0);
    float dayMix = smoothstep(-0.08, 0.12, mu);
    vec3 day = texture2D(dayMap, vUv).rgb;
    float cloud = texture2D(cloudMap, vUv).r;
    vec3 surface = mix(day, vec3(1.0), cloud * 0.85);
    vec3 col = surface * (0.02 + 1.25 * lit);
    vec3 night = texture2D(nightMap, vUv).rgb * (1.0 - cloud * 0.7);
    col += night * 1.6 * (1.0 - dayMix) * hasNight;
    // thin blue atmosphere at the limb, only where the Sun reaches
    float rim = pow(1.0 - clamp(dot(n, normalize(vViewDirW)), 0.0, 1.0), 3.0);
    col += vec3(0.30, 0.55, 1.0) * rim * smoothstep(-0.25, 0.35, mu) * 0.9;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const haloFrag = /* glsl */ `
  uniform vec3 sunDir;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  void main() {
    vec3 n = normalize(vNormalW);
    float edge = 1.0 - abs(dot(n, normalize(vViewDirW)));
    float glow = pow(edge, 5.0) * smoothstep(-0.35, 0.4, dot(n, normalize(sunDir)));
    gl_FragColor = vec4(vec3(0.35, 0.6, 1.0) * glow * 0.8, 1.0);
    #include <colorspace_fragment>
  }
`

function loadTex(url: string, srgb: boolean, onLoad: (t: THREE.Texture) => void) {
  return new THREE.TextureLoader().load(url, (t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    t.anisotropy = 4
    onLoad(t)
  })
}

/** Blank 1×1 texture so the shader can run before the real maps arrive. */
function solid(r: number, g: number, b: number) {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1)
  t.needsUpdate = true
  return t
}

/**
 * Earth at its real size and distance. Day side from NASA Blue Marble, city lights on the night
 * side, and clouds. The terminator follows the same Sun direction that lights the Moon, so the
 * phase you see is the real one.
 */
export function Earth({ position, quaternion, sunDir }: { position: THREE.Vector3; quaternion: THREE.Quaternion; sunDir: THREE.Vector3 }) {
  const group = useRef<THREE.Group>(null)
  const uniforms = useMemo(() => ({
    dayMap: { value: solid(40, 80, 160) as THREE.Texture },
    nightMap: { value: solid(0, 0, 0) as THREE.Texture },
    cloudMap: { value: solid(0, 0, 0) as THREE.Texture },
    sunDir: { value: new THREE.Vector3(1, 0, 0) },
    hasNight: { value: 1 },
  }), [])
  const haloUniforms = useMemo(() => ({ sunDir: uniforms.sunDir }), [uniforms])

  const mat = useRef<THREE.ShaderMaterial>(null)
  useEffect(() => {
    // Write into the live material's uniforms (R3F may hand the material its own copy).
    const set = (key: 'dayMap' | 'nightMap' | 'cloudMap') => (t: THREE.Texture) => {
      uniforms[key].value = t
      if (mat.current) mat.current.uniforms[key].value = t
    }
    const ts = [
      loadTex('/textures/earth_day.jpg', true, set('dayMap')),
      loadTex('/textures/earth_night.jpg', true, set('nightMap')),
      loadTex('/textures/earth_clouds.jpg', false, set('cloudMap')),
    ]
    return () => ts.forEach((t) => t.dispose())
  }, [uniforms])

  const first = useRef(true)
  useFrame(() => {
    const g = group.current
    if (!g) return
    if (first.current) {
      g.position.copy(position)
      g.quaternion.copy(quaternion)
      first.current = false
    } else {
      g.position.lerp(position, 0.15)
      g.quaternion.slerp(quaternion, 0.15)
    }
    uniforms.sunDir.value.copy(sunDir).normalize()
    if (mat.current) mat.current.uniforms.sunDir.value.copy(uniforms.sunDir.value)
  })

  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS, 96, 64]} />
        <shaderMaterial ref={mat} vertexShader={earthVert} fragmentShader={earthFrag} uniforms={uniforms} />
      </mesh>
      <mesh scale={1.06}>
        <sphereGeometry args={[EARTH_RADIUS, 64, 48]} />
        <shaderMaterial
          vertexShader={earthVert}
          fragmentShader={haloFrag}
          uniforms={haloUniforms}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

function sunTexture() {
  const s = 512
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  const h = s / 2
  // The disc fills the inner 1/8 of the sprite; the rest is glare that fades out.
  const disc = h / 8
  const glow = g.createRadialGradient(h, h, disc * 0.9, h, h, h)
  glow.addColorStop(0, 'rgba(255,236,200,0.55)')
  glow.addColorStop(0.08, 'rgba(255,220,170,0.22)')
  glow.addColorStop(0.3, 'rgba(255,200,140,0.06)')
  glow.addColorStop(1, 'rgba(255,190,120,0)')
  g.fillStyle = glow
  g.fillRect(0, 0, s, s)
  const core = g.createRadialGradient(h, h, 0, h, h, disc)
  core.addColorStop(0, 'rgba(255,255,255,1)')
  core.addColorStop(0.8, 'rgba(255,250,235,1)') // slight limb darkening
  core.addColorStop(1, 'rgba(255,235,200,0.95)')
  g.fillStyle = core
  g.beginPath()
  g.arc(h, h, disc, 0, Math.PI * 2)
  g.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * Sunburst glare for the realistic sky: a warm halo and thin rays, like a camera looking at the Sun.
 * Drawn once to a canvas; the sprite carrying it spans about 24° of sky.
 */
function flareTexture() {
  const s = 1024
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  const h = s / 2
  g.globalCompositeOperation = 'lighter'
  const halo = g.createRadialGradient(h, h, 0, h, h, h)
  halo.addColorStop(0, 'rgba(255,244,214,0.9)')
  halo.addColorStop(0.03, 'rgba(255,226,170,0.45)')
  halo.addColorStop(0.12, 'rgba(255,196,120,0.12)')
  halo.addColorStop(0.4, 'rgba(255,170,90,0.025)')
  halo.addColorStop(1, 'rgba(255,160,80,0)')
  g.fillStyle = halo
  g.fillRect(0, 0, s, s)
  // Rays: a fixed pseudo-random fan so the burst looks the same every load.
  let seed = 3
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const rays = 28
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + rnd() * 0.12
    const len = h * (i % 2 ? 0.28 + rnd() * 0.2 : 0.45 + rnd() * 0.4)
    const w = 2 + rnd() * 3
    g.save()
    g.translate(h, h)
    g.rotate(a)
    const grad = g.createLinearGradient(0, 0, len, 0)
    grad.addColorStop(0, 'rgba(255,240,205,0.55)')
    grad.addColorStop(0.25, 'rgba(255,220,160,0.18)')
    grad.addColorStop(1, 'rgba(255,200,130,0)')
    g.fillStyle = grad
    g.beginPath()
    g.moveTo(0, -w)
    g.lineTo(len, 0)
    g.lineTo(0, w)
    g.closePath()
    g.fill()
    g.restore()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * The Sun as a disc of its true apparent size (~0.53° across) with a soft glare around it.
 * With `flare`, a camera-style sunburst is added around it; the disc itself stays true to size.
 */
export function Sun({ dir, flare = false }: { dir: THREE.Vector3; flare?: boolean }) {
  const ref = useRef<THREE.Group>(null)
  const map = useMemo(() => sunTexture(), [])
  const flareMap = useMemo(() => (flare ? flareTexture() : null), [flare])
  useEffect(() => () => map.dispose(), [map])
  useEffect(() => () => flareMap?.dispose(), [flareMap])
  const target = useMemo(() => new THREE.Vector3(), [])
  const size = 2 * SUN_DRAW_DISTANCE * Math.tan(SUN_ANGULAR_RADIUS) * 8 // the disc is 1/8 of the sprite's half-width
  const flareSize = 2 * SUN_DRAW_DISTANCE * Math.tan(12 * (Math.PI / 180))
  useFrame(() => {
    if (!ref.current) return
    target.copy(dir).normalize().multiplyScalar(SUN_DRAW_DISTANCE)
    ref.current.position.lerp(target, 0.15)
  })
  return (
    <group ref={ref} position={dir.clone().normalize().multiplyScalar(SUN_DRAW_DISTANCE)}>
      {flareMap && (
        <sprite scale={[flareSize, flareSize, 1]} renderOrder={-1}>
          <spriteMaterial map={flareMap} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} transparent />
        </sprite>
      )}
      <sprite scale={[size, size, 1]} renderOrder={-1}>
        <spriteMaterial map={map} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} transparent />
      </sprite>
    </group>
  )
}

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const skyFrag = /* glsl */ `
  uniform sampler2D map;
  uniform float strength;
  varying vec3 vDir;
  const float PI = 3.141592653589793;
  void main() {
    // Local frame = J2000 equatorial (x: RA 0h, z: north). NASA's map has RA 0h in the middle,
    // RA increasing to the left, plate carree.
    vec3 d = normalize(vDir);
    float ra = atan(d.y, d.x);
    vec2 uv = vec2(fract(0.5 - ra / (2.0 * PI)), 0.5 + asin(clamp(d.z, -1.0, 1.0)) / PI);
    gl_FragColor = vec4(texture2D(map, uv).rgb * strength, 1.0);
    #include <colorspace_fragment>
  }
`

/**
 * The real sky behind everything: NASA SVS Deep Star Maps 2020 (Hipparcos-2, Tycho-2, Gaia DR2),
 * turned to where the stars really are from the Moon at this time. Loads only when shown.
 */
export function MilkyWay({ equatorial }: { equatorial: [V3, V3, V3] }) {
  const mesh = useRef<THREE.Mesh>(null)
  const { camera } = useThree()
  const uniforms = useMemo(() => ({ map: { value: solid(0, 0, 0) as THREE.Texture }, strength: { value: 0 } }), [])
  const mat = useRef<THREE.ShaderMaterial>(null)
  const loaded = useRef(false)
  useEffect(() => {
    const t = new THREE.TextureLoader().load('/textures/starmap_2020_4k.jpg', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.generateMipmaps = false // the map is about 1:1 with screen pixels; no mipmaps also avoids a seam at RA 12h
      tex.minFilter = THREE.LinearFilter
      uniforms.map.value = tex
      if (mat.current) mat.current.uniforms.map.value = tex
      loaded.current = true
    })
    return () => t.dispose()
  }, [uniforms])
  const quaternion = useMemo(() => {
    const [x, y, z] = equatorial.map((v) => new THREE.Vector3(...v))
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
  }, [equatorial])
  useFrame((_, dt) => {
    const m = mesh.current
    if (!m) return
    m.position.copy(camera.position) // always at infinity
    m.quaternion.slerp(quaternion, 0.15)
    if (loaded.current) {
      const u = (mat.current ?? { uniforms }).uniforms.strength
      u.value = Math.min(0.75, u.value + dt * 0.8) // fade in once loaded
    }
  })
  return (
    <mesh ref={mesh} renderOrder={-2} frustumCulled={false} quaternion={quaternion}>
      <sphereGeometry args={[15000, 64, 32]} />
      <shaderMaterial ref={mat} vertexShader={skyVert} fragmentShader={skyFrag} uniforms={uniforms} side={THREE.BackSide} depthWrite={false} />
    </mesh>
  )
}

/** Background stars on a shell far beyond Earth and the Sun (positions are decorative). */
export function StarField({ count = 3000, radius = 12000 }: { count?: number; radius?: number }) {
  const geo = useMemo(() => {
    let seed = 11
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const z = 2 * rnd() - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z)
      pos.set([radius * r * Math.cos(a), radius * z, radius * r * Math.sin(a)], i * 3)
      const b = 0.25 + Math.pow(rnd(), 3) * 0.75
      const warm = rnd()
      col.set([b * (0.85 + 0.15 * warm), b * 0.92, b * (1.05 - 0.2 * warm)], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [count, radius])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <points geometry={geo}>
      <pointsMaterial size={1.6} sizeAttenuation={false} vertexColors depthWrite={false} toneMapped={false} />
    </points>
  )
}
