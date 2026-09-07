import { useEffect, useMemo } from 'react'
import { Environment, Lightformer } from '@react-three/drei'
import { AmbientLight, Color, DirectionalLight, PointLight } from 'three'
import type { LightKeyframe, PerfProfile } from '@/types'

/** Scratch colour for the light lerps below. Single-threaded, so one is enough. */
const TMP = new Color()

/**
 * A four-light studio rig plus a lightformer environment.
 *
 * The lights are constructed imperatively rather than declared as JSX so the
 * scroll choreographer can grade them by mutating the objects directly — no ref
 * plumbing, no React work per frame. `<primitive>` mounts the same instances.
 *
 * The environment is a handful of emissive rectangles rendered once into a
 * cubemap. That is what puts the long soft highlight down the TPU rib cage: a
 * plain three-point rig gives point highlights, and point highlights read as
 * plastic. No external HDR file is fetched, so nothing here can 404.
 */

export interface LightRig {
  key: DirectionalLight
  fill: DirectionalLight
  rim: DirectionalLight
  kicker: PointLight
  ambient: AmbientLight
}

/** Whether this profile can afford a shadow map at all. */
export const castsShadows = (profile: PerfProfile): boolean => profile.tier !== 'low'

export function createLightRig(profile: PerfProfile): LightRig {
  const key = new DirectionalLight('#ffffff', 2.4)
  key.position.set(2.9, 4.4, 3.2)
  if (castsShadows(profile)) {
    key.castShadow = true
    key.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize)
    // Tight frustum around a 2.6-unit-long shoe: wasted shadow texels are the
    // usual reason a 2048 map still looks like 512.
    key.shadow.camera.near = 1.5
    key.shadow.camera.far = 12
    key.shadow.camera.left = -2.2
    key.shadow.camera.right = 2.2
    key.shadow.camera.top = 2.2
    key.shadow.camera.bottom = -2.2
    key.shadow.bias = -0.0006
    key.shadow.normalBias = 0.018
    key.shadow.radius = 3
  }

  const fill = new DirectionalLight('#8fa8cf', 0.45)
  fill.position.set(-3.8, 1.5, 2.4)

  const rim = new DirectionalLight('#e6eefb', 3.4)
  rim.position.set(-2.4, 2.2, -3.9)

  const kicker = new PointLight('#ff5f3d', 0.5, 7, 2)
  kicker.position.set(0.4, -1.1, 2.2)

  const ambient = new AmbientLight('#93a6c8', 0.1)

  return { key, fill, rim, kicker, ambient }
}

/** Push one sampled keyframe blend onto the rig. */
export function applyLights(rig: LightRig, a: LightKeyframe, b: LightKeyframe, t: number): void {
  const mix = (x: number, y: number) => x + (y - x) * t

  rig.key.intensity = mix(a.key.intensity, b.key.intensity)
  rig.key.position.set(
    mix(a.key.position[0], b.key.position[0]),
    mix(a.key.position[1], b.key.position[1]),
    mix(a.key.position[2], b.key.position[2]),
  )
  rig.key.color.set(a.key.color).lerp(TMP.set(b.key.color), t)

  rig.fill.intensity = mix(a.fill.intensity, b.fill.intensity)
  rig.fill.position.set(
    mix(a.fill.position[0], b.fill.position[0]),
    mix(a.fill.position[1], b.fill.position[1]),
    mix(a.fill.position[2], b.fill.position[2]),
  )
  rig.fill.color.set(a.fill.color).lerp(TMP.set(b.fill.color), t)

  rig.rim.intensity = mix(a.rim.intensity, b.rim.intensity)
  rig.rim.position.set(
    mix(a.rim.position[0], b.rim.position[0]),
    mix(a.rim.position[1], b.rim.position[1]),
    mix(a.rim.position[2], b.rim.position[2]),
  )
  rig.rim.color.set(a.rim.color).lerp(TMP.set(b.rim.color), t)

  rig.kicker.intensity = mix(a.kicker.intensity, b.kicker.intensity)
  rig.kicker.position.set(
    mix(a.kicker.position[0], b.kicker.position[0]),
    mix(a.kicker.position[1], b.kicker.position[1]),
    mix(a.kicker.position[2], b.kicker.position[2]),
  )
  rig.kicker.color.set(a.kicker.color).lerp(TMP.set(b.kicker.color), t)

  rig.ambient.intensity = mix(a.ambient, b.ambient)
}

export interface LightingProps {
  rig: LightRig
  profile: PerfProfile
}

export function Lighting({ rig, profile }: LightingProps) {
  useEffect(
    () => () => {
      rig.key.dispose()
      rig.fill.dispose()
      rig.rim.dispose()
      rig.kicker.dispose()
      rig.ambient.dispose()
    },
    [rig],
  )

  // A softer, wider set of formers on weak hardware: a 64px cubemap cannot
  // resolve thin strips, and aliased reflections look worse than broad ones.
  const strips = useMemo(() => (profile.tier === 'low' ? 2 : 4), [profile.tier])

  return (
    <>
      <primitive object={rig.key} />
      <primitive object={rig.fill} />
      <primitive object={rig.rim} />
      <primitive object={rig.kicker} />
      <primitive object={rig.ambient} />

      <Environment resolution={profile.envResolution} frames={1} background={false}>
        {/* Overhead softbox — the main event in every reflective surface. */}
        <Lightformer form="rect" intensity={2.6} color="#ffffff" scale={[7, 3, 1]} position={[0, 5.5, -1]} rotation={[Math.PI / 2, 0, 0]} />
        {/* Long vertical strips: these are the streaks that travel across the
            rib cage as the shoe turns, and the reason it reads as moulded TPU. */}
        {Array.from({ length: strips }, (_, i) => {
          const x = -4 + (8 / Math.max(1, strips - 1)) * i
          return (
            <Lightformer
              key={i}
              form="rect"
              intensity={1.5}
              color="#dce7ff"
              scale={[0.5, 5, 1]}
              position={[x, 2.2, 3.4]}
              target={[0, 0.5, 0]}
            />
          )
        })}
        {/* Cool bounce from behind, warm bounce from below. */}
        <Lightformer form="rect" intensity={1.1} color="#7d97c8" scale={[9, 4, 1]} position={[0, 2, -6]} target={[0, 0.5, 0]} />
        <Lightformer form="circle" intensity={0.7} color="#ff7a52" scale={[4, 4, 1]} position={[0, -2.4, 1.6]} target={[0, 0.4, 0]} />
        <Lightformer form="rect" intensity={1.8} color="#ffffff" scale={[0.35, 6, 1]} position={[-4.6, 1.6, -1.4]} target={[0, 0.5, 0]} />
      </Environment>
    </>
  )
}
