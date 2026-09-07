import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import {
  Bloom,
  ChromaticAberration,
  DepthOfField,
  EffectComposer,
  Noise,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import type {
  BloomEffect,
  ChromaticAberrationEffect,
  DepthOfFieldEffect,
  EffectComposer as PostComposer,
  NoiseEffect,
  VignetteEffect,
} from 'postprocessing'
import { MathUtils, Vector2 } from 'three'
import { POST_KEYS } from '@/config/timeline'
import { segmentAt } from '@/lib/math'
import type { PerfProfile, PostKeyframe } from '@/types'

/**
 * Post-processing.
 *
 * Deliberately restrained: this is a product film, and the product has to stay
 * the sharpest thing on screen. Bloom only ever lifts specular highlights
 * (threshold never drops below 0.74), grain sits around 3%, chromatic aberration
 * is measured in ten-thousandths of a frame, and depth of field is focused on the
 * camera's own target so the sneaker is never the blurred part.
 *
 * Every parameter is animated by mutating the effect objects, so grading a frame
 * costs no React work and no shader recompile.
 *
 * Tone mapping belongs to the chain rather than to the renderer. The composer
 * pins `gl.toneMapping` to `NoToneMapping` for as long as it is mounted — it has
 * to, because bloom and chromatic aberration want scene-referred values, not
 * display-referred ones — so asking the renderer for ACES would grade nothing.
 * The `ToneMapping` effect sits at the point in the chain where the image stops
 * being light and starts being a picture: after the two effects that read HDR
 * highlights, before the vignette and grain that belong on the final print.
 */

/**
 * Depth of field in-focus band, in world units. The shoe is ~0.9 tall, so a
 * 0.55-unit band keeps the whole product crisp while the room falls away.
 */
const FOCUS_RANGE = 0.55

export interface PostRig {
  bloom: BloomEffect | null
  dof: DepthOfFieldEffect | null
  vignette: VignetteEffect | null
  noise: NoiseEffect | null
  chroma: ChromaticAberrationEffect | null
  /** Sampled exposure, applied to the renderer by the choreographer. */
  exposure: number
}

export function createPostRig(): PostRig {
  return { bloom: null, dof: null, vignette: null, noise: null, chroma: null, exposure: 1 }
}

const CHROMA = new Vector2()

/**
 * Sample `POST_KEYS` and push the result onto the effect chain.
 *
 * @param focusDistance camera-to-target distance, so DOF tracks the real subject
 *                      even after the aspect fitter has moved the camera.
 */
export function applyPost(rig: PostRig, progress: number, focusDistance: number, reduced: boolean): number {
  const seg = segmentAt(POST_KEYS, progress)
  const t = seg.e
  const a: PostKeyframe = seg.a
  const b: PostKeyframe = seg.b
  const mix = (x: number, y: number) => MathUtils.lerp(x, y, t)

  if (rig.bloom) {
    rig.bloom.intensity = mix(a.bloomIntensity, b.bloomIntensity)
    rig.bloom.luminanceMaterial.threshold = mix(a.bloomThreshold, b.bloomThreshold)
  }

  if (rig.dof) {
    // Focus on where the camera is actually looking, not on an authored number:
    // the aspect fitter moves the camera back on narrow viewports, and a phone
    // focusing at the desktop distance would blur the product and sharpen the fog.
    rig.dof.cocMaterial.focusDistance = focusDistance
    rig.dof.cocMaterial.focusRange = FOCUS_RANGE
    rig.dof.bokehScale = mix(a.dofBokeh, b.dofBokeh) * (reduced ? 0.6 : 1)
  }

  if (rig.vignette) rig.vignette.darkness = mix(a.vignette, b.vignette)
  if (rig.noise) rig.noise.blendMode.opacity.value = mix(a.grain, b.grain)

  if (rig.chroma) {
    const c = mix(a.chroma, b.chroma)
    CHROMA.set(c, c * 0.62)
    rig.chroma.offset = CHROMA
  }

  rig.exposure = mix(a.exposure, b.exposure)
  return rig.exposure
}

export interface PostFXProps {
  rig: PostRig
  profile: PerfProfile
  reduced: boolean
}

export function PostFX({ rig, profile, reduced }: PostFXProps) {
  const gl = useThree((s) => s.gl)
  const composer = useRef<PostComposer | null>(null)

  // Grain is the one effect reduced motion switches off outright: a moving noise
  // field is exactly the kind of full-screen shimmer the setting exists to stop.
  const grain = profile.grain && !reduced

  const initialChroma = useMemo(() => new Vector2(0.0012, 0.00074), [])

  useEffect(() => {
    const previous = gl.toneMappingExposure
    return () => {
      gl.toneMappingExposure = previous
    }
  }, [gl])

  // Depth of field is the only effect here that reads depth, so unmounting it when
  // PerfGuard drops a tier makes the composer drop its depth texture. It does that
  // by disposing the texture and nulling it *without* disposing the render targets
  // it hangs off — so the ping-pong buffers keep a DEPTH_COMPONENT32F multisample
  // renderbuffer (sized for the float depth texture) while their resolve targets get
  // rebuilt at DEPTH_COMPONENT24. The formats then disagree and the MSAA resolve
  // blit is rejected every frame, which costs the colour resolve too: antialiasing
  // silently stops. Disposing both buffers rebuilds them against the depth state
  // that is actually current — the same thing the composer does on the way in, when
  // it attaches a depth texture.
  useEffect(() => {
    // A null depth texture is the signal that the drop happened. In practice the
    // composer is still mid-cascade when this effect runs — it reconciles its pass
    // list across two layout-effect passes — so the repair lands on the next frame
    // and one resolve is lost at the moment of the switch. Cheap to close only by
    // polling every frame or by never unmounting the pass, and neither is worth a
    // permanent cost to fix a single frame of a tier change nobody is watching for.
    const repair = () => {
      const instance = composer.current
      if (!instance || instance.inputBuffer.depthTexture !== null) return false
      instance.inputBuffer.dispose()
      instance.outputBuffer.dispose()
      return true
    }
    if (repair()) return
    const id = requestAnimationFrame(repair)
    return () => cancelAnimationFrame(id)
  }, [profile.dof])

  return (
    <EffectComposer ref={composer} enabled multisampling={profile.antialias ? 4 : 0} enableNormalPass={false}>
      {profile.dof ? (
        <DepthOfField
          ref={(effect: DepthOfFieldEffect | null) => {
            rig.dof = effect
          }}
          focusDistance={4.7}
          focusRange={FOCUS_RANGE}
          bokehScale={2.6}
          resolutionScale={0.5}
        />
      ) : (
        <></>
      )}

      <Bloom
        ref={(effect: BloomEffect | null) => {
          rig.bloom = effect
        }}
        intensity={0.55}
        luminanceThreshold={0.82}
        luminanceSmoothing={0.22}
        mipmapBlur
        radius={0.72}
      />

      {profile.chromaticAberration ? (
        <ChromaticAberration
          ref={(effect: ChromaticAberrationEffect | null) => {
            rig.chroma = effect
          }}
          offset={initialChroma}
          radialModulation
          modulationOffset={0.42}
          blendFunction={BlendFunction.NORMAL}
        />
      ) : (
        <></>
      )}

      {/* ACES is what makes a bright specular on patent leather roll off instead of
          flattening into a white blob, and it is also what puts the authored
          exposure ramp on screen: three uploads `gl.toneMappingExposure` into this
          shader's `toneMappingExposure` uniform, so the per-chapter exposure the
          choreographer writes each frame lands here with nothing else to wire. */}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />

      <Vignette
        ref={(effect: VignetteEffect | null) => {
          rig.vignette = effect
        }}
        offset={0.28}
        darkness={0.6}
        blendFunction={BlendFunction.NORMAL}
      />

      {grain ? (
        <Noise
          ref={(effect: NoiseEffect | null) => {
            rig.noise = effect
          }}
          opacity={0.035}
          premultiply
          blendFunction={BlendFunction.OVERLAY}
        />
      ) : (
        <></>
      )}
    </EffectComposer>
  )
}
