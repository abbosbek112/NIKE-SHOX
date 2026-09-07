import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Fog,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
} from 'three'
import type { EnvKeyframe, PerfProfile } from '@/types'

/**
 * The room.
 *
 * The brief was explicit that the product must not simply float in black, so the
 * space is built from four cheap layers that the scroll timeline grades
 * independently: a band of additive haze behind the shoe, a studio floor, a
 * technical grid that only surfaces during the technology chapter, and a handful
 * of architectural slabs far enough back that fog does most of the work on them.
 *
 * All four are plain meshes with hand-written shaders so every value the
 * timeline touches is a uniform — no React re-render is needed to grade a frame.
 */

const HAZE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * The same pass-through, plus three.js's fog plumbing.
 *
 * A `ShaderMaterial` gets `#define USE_FOG` from the renderer when `fog: true`,
 * but nothing else: the `fogColor`/`fogNear`/`fogFar` uniforms and the `vFogDepth`
 * varying are ours to declare, and `fog_vertex` reads a local `mvPosition` that a
 * hand-written shader has no reason to have. Miss any of that and the renderer
 * writes into an absent uniform on the first frame it draws the mesh.
 */
const GROUND_VERT = /* glsl */ `
  #include <fog_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

/** Wide soft ellipse — a lighting cove behind the product, not a vignette. */
const HAZE_FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uStrength;
  void main() {
    vec2 p = vUv - 0.5;
    float r = length(vec2(p.x * 0.55, p.y * 1.35));
    float a = smoothstep(0.5, 0.015, r);
    a = pow(a, 1.6) * uStrength;
    gl_FragColor = vec4(uColor * a, a);
  }
`

const FLOOR_FRAG = /* glsl */ `
  precision mediump float;
  #include <fog_pars_fragment>
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform vec3 uSheen;
  uniform float uOpacity;
  uniform float uReflect;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(vec2(p.x * 0.75, p.y));
    float fade = smoothstep(1.0, 0.05, r);
    // A soft pool of light directly under the product reads as a polished floor
    // without paying for a second render pass.
    float pool = smoothstep(0.62, 0.0, length(vec2(p.x * 1.15, p.y * 1.9)));
    vec3 c = mix(uColor, uSheen, pool * uReflect);
    float a = fade * uOpacity * (0.35 + 0.65 * pool);
    gl_FragColor = vec4(c, a);
    #include <fog_fragment>
  }
`

const GRID_FRAG = /* glsl */ `
  precision highp float;
  #include <fog_pars_fragment>
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uScale;
  float grid(vec2 uv, float scale) {
    vec2 c = uv * scale;
    vec2 d = abs(fract(c) - 0.5) / max(fwidth(c), vec2(1e-5));
    return 1.0 - min(min(d.x, d.y), 1.0);
  }
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float fade = smoothstep(1.0, 0.1, length(p));
    float g = grid(vUv, uScale) * 0.55 + grid(vUv, uScale * 0.25) * 0.45;
    float a = g * fade * uOpacity;
    if (a < 0.002) discard;
    gl_FragColor = vec4(uColor, a);
    #include <fog_fragment>
  }
`

export interface BackdropRig {
  haze: ShaderMaterial
  floor: ShaderMaterial
  grid: ShaderMaterial
  slabs: Group | null
  background: Color
  fog: Fog
}

export function createBackdropRig(): BackdropRig {
  const haze = new ShaderMaterial({
    vertexShader: HAZE_VERT,
    fragmentShader: HAZE_FRAG,
    uniforms: { uColor: { value: new Color('#243352') }, uStrength: { value: 0.7 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
  })

  const floor = new ShaderMaterial({
    vertexShader: GROUND_VERT,
    fragmentShader: FLOOR_FRAG,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uColor: { value: new Color('#0d1017') },
        uSheen: { value: new Color('#38496a') },
        uOpacity: { value: 0.6 },
        uReflect: { value: 0.4 },
      },
    ]),
    transparent: true,
    depthWrite: false,
    fog: true,
  })

  const grid = new ShaderMaterial({
    vertexShader: GROUND_VERT,
    fragmentShader: GRID_FRAG,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uColor: { value: new Color('#7d90b5') },
        uOpacity: { value: 0 },
        uScale: { value: 26 },
      },
    ]),
    transparent: true,
    depthWrite: false,
    fog: true,
  })

  return {
    haze,
    floor,
    grid,
    slabs: null,
    background: new Color('#05060a'),
    fog: new Fog(new Color('#05060a'), 6, 18),
  }
}

/** Architectural slabs, hand-placed so nothing lines up with anything else. */
const SLABS: readonly { position: [number, number, number]; size: [number, number, number]; tone: number }[] = [
  { position: [-6.2, 3.4, -9.5], size: [1.5, 9.4, 0.3], tone: 1.0 },
  { position: [-3.1, 2.2, -12.5], size: [3.4, 6.2, 0.3], tone: 0.72 },
  { position: [4.6, 4.0, -10.8], size: [1.1, 11.0, 0.3], tone: 0.9 },
  { position: [7.9, 1.9, -8.2], size: [2.6, 5.4, 0.3], tone: 0.6 },
  { position: [0.9, 5.6, -14.0], size: [7.2, 1.2, 0.3], tone: 0.5 },
  { position: [-9.4, 1.4, -7.0], size: [2.0, 4.2, 0.3], tone: 0.8 },
]

export interface BackdropProps {
  rig: BackdropRig
  profile: PerfProfile
  slabsRef: (group: Group | null) => void
}

export function Backdrop({ rig, profile, slabsRef }: BackdropProps) {
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    scene.background = rig.background
    scene.fog = rig.fog
    return () => {
      scene.background = null
      scene.fog = null
    }
  }, [scene, rig])

  useEffect(
    () => () => {
      rig.haze.dispose()
      rig.floor.dispose()
      rig.grid.dispose()
    },
    [rig],
  )

  const slabMaterials = useMemo(
    () =>
      SLABS.map(() => ({
        color: new Color('#131a28'),
      })),
    [],
  )

  return (
    <group name="backdrop">
      <mesh name="haze" position={[0, 1.1, -6.5]} material={rig.haze}>
        <planeGeometry args={[34, 20]} />
      </mesh>

      <mesh name="floor" rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} material={rig.floor}>
        <planeGeometry args={[44, 44]} />
      </mesh>

      {profile.tier !== 'low' && (
        <mesh name="grid" rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} material={rig.grid}>
          <planeGeometry args={[30, 30]} />
        </mesh>
      )}

      <group name="slabs" ref={slabsRef}>
        {SLABS.map((slab, i) => (
          <mesh key={i} position={slab.position} userData={{ tone: slab.tone }}>
            <boxGeometry args={slab.size} />
            <meshBasicMaterial
              color={slabMaterials[i].color}
              transparent
              opacity={0}
              side={DoubleSide}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** Grade the slab group. Kept here so the shader knowledge stays in one file. */
export function applySlabs(group: Group | null, opacity: number, drift: number): void {
  if (!group) return
  group.position.x = drift
  group.children.forEach((child) => {
    const mesh = child as Mesh
    const material = mesh.material as MeshBasicMaterial
    const tone = (mesh.userData.tone as number) ?? 1
    material.opacity = opacity * tone
    material.visible = material.opacity > 0.004
  })
}

const TMP = new Color()
/** Floor base tone: the background, lifted just enough to read as a surface. */
const FLOOR_LIFT = 1.9

/**
 * Push one sampled `ENV_KEYS` blend onto the room.
 *
 * `fogScale` comes from the camera's aspect fitter: when a narrow viewport pushes
 * the camera back, the fog has to move back with it or the product would fade
 * into the haze on a phone.
 */
export function applyBackdrop(
  rig: BackdropRig,
  a: EnvKeyframe,
  b: EnvKeyframe,
  t: number,
  fogScale: number,
  drift: number,
): void {
  const mix = (x: number, y: number) => x + (y - x) * t

  rig.background.set(a.background).lerp(TMP.set(b.background), t)
  rig.fog.color.copy(rig.background)
  rig.fog.near = mix(a.fogNear, b.fogNear) * fogScale
  rig.fog.far = mix(a.fogFar, b.fogFar) * fogScale

  const haze = rig.haze.uniforms.uColor.value as Color
  haze.set(a.haze).lerp(TMP.set(b.haze), t)
  rig.haze.uniforms.uStrength.value = mix(a.hazeStrength, b.hazeStrength)

  const floorColor = rig.floor.uniforms.uColor.value as Color
  floorColor.copy(rig.background).multiplyScalar(FLOOR_LIFT)
  ;(rig.floor.uniforms.uSheen.value as Color).copy(haze)
  rig.floor.uniforms.uOpacity.value = mix(a.floorOpacity, b.floorOpacity)
  rig.floor.uniforms.uReflect.value = mix(a.floorReflect, b.floorReflect)

  rig.grid.uniforms.uOpacity.value = mix(a.gridOpacity, b.gridOpacity)

  applySlabs(rig.slabs, mix(a.slabOpacity, b.slabOpacity), drift)
}
