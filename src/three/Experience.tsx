import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { PCFShadowMap, type Camera, type Scene, type WebGLRenderer } from 'three'
import { colorwayById } from '@/config/product'
import { useExperience } from '@/state/useExperience'
import { ShoeMaterials } from '@/three/materials/materials'
import { SceneRoot } from '@/three/scene/SceneRoot'

/**
 * The WebGL root.
 *
 * Two responsibilities only: configure the renderer, and keep the material set
 * alive across colourway changes. Everything that moves lives in `SceneRoot`.
 *
 * `ShoeMaterials` is built *outside* React's tree and handed in as a prop rather
 * than created in a `useMemo` here, because the loading sequence needs it to
 * exist before the canvas mounts — drawing fourteen zones' worth of procedural
 * texture while the canvas initialises would stall the loader mid-count.
 *
 * Nothing in the scene attaches a pointer handler, so R3F's raycaster keeps an
 * empty interaction list and never walks the sneaker's 75k triangles. Dragging is
 * a DOM gesture on the wrapper; the cursor's over-product test is done in screen
 * space by the choreographer.
 */

/**
 * Exposure only. The filmic curve is a pass in `PostFX`, not a renderer setting —
 * the composer holds `gl.toneMapping` at `NoToneMapping` while it is mounted, so
 * the scene renders scene-referred into its buffers and gets graded at the end of
 * the chain. `gl.toneMappingExposure` is still the right home for exposure: three
 * feeds it to the tone mapping shader's uniform, which is how the choreographer's
 * per-chapter ramp reaches the image.
 */
function configure(gl: WebGLRenderer): void {
  gl.toneMappingExposure = 1
}

/**
 * Report context loss upward instead of leaving a black rectangle on screen.
 *
 * A lost context on a page whose entire subject is a 3D product is not a
 * degraded experience, it is a blank one — so it drops to the same DOM fallback
 * that machines without WebGL get.
 */
function ContextGuard() {
  const gl = useThree((s) => s.gl)
  const failWebGL = useExperience((s) => s.failWebGL)

  useEffect(() => {
    const canvas = gl.domElement
    const onLost = (event: Event) => {
      // Preventing the default is what lets the browser attempt a restore.
      event.preventDefault()
      failWebGL()
    }
    canvas.addEventListener('webglcontextlost', onLost)
    return () => canvas.removeEventListener('webglcontextlost', onLost)
  }, [gl, failWebGL])

  return null
}

/**
 * Publish the renderer, scene and camera so the boot sequence can await shader
 * compilation. All three, because `compileAsync` needs the scene it is compiling
 * and the camera it will be seen from — compiling against the wrong camera would
 * warm up the wrong permutations and the reveal would still hitch.
 */
function Ready({ onReady }: { onReady: (ctx: SceneContext) => void }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true
    // One frame of layout settling first: `compileAsync` on a scene whose lights
    // have not been graded yet would compile the wrong permutations.
    const id = requestAnimationFrame(() => onReady({ gl, scene, camera }))
    return () => cancelAnimationFrame(id)
  }, [gl, scene, camera, onReady])

  return null
}

export interface SceneContext {
  gl: WebGLRenderer
  scene: Scene
  camera: Camera
}

export interface ExperienceProps {
  materials: ShoeMaterials
  onReady: (ctx: SceneContext) => void
}

export function Experience({ materials, onReady }: ExperienceProps) {
  const profile = useExperience((s) => s.perf)
  const colorway = useExperience((s) => s.colorway)

  // The material set owns the crossfade, so the store change only has to name
  // the target; `materials.update(dt)` in the choreographer does the blending.
  useEffect(() => {
    materials.setColorway(colorwayById(colorway))
  }, [materials, colorway])

  const glConfig = useMemo(
    () => ({
      antialias: profile.antialias,
      alpha: false,
      powerPreference: 'high-performance' as const,
      // The scene is opaque and the composer owns the final blit, so there is
      // nothing to gain from preserving the drawing buffer.
      preserveDrawingBuffer: false,

      stencil: false,
      depth: true,
    }),
    [profile.antialias],
  )

  // `PCFSoftShadowMap` is deprecated in three r185 and silently downgrades to
  // `PCFShadowMap`, so ask for what we actually get. It has to be requested through
  // the `shadows` prop rather than set in `onCreated`: R3F writes `shadowMap.type`
  // itself from this prop, after `onCreated` has run, and a bare boolean makes it
  // write the deprecated one. The soft edge under the shoe comes from the light's
  // own radius and the shadow camera's tight frustum instead.
  const shadows = useMemo(
    () => ({ type: PCFShadowMap, enabled: profile.tier !== 'low' }),
    [profile.tier],
  )

  return (
    <Canvas
      className="stage__canvas"
      dpr={profile.dpr as [number, number]}
      gl={glConfig}
      shadows={shadows}
      camera={{ fov: 30, near: 0.08, far: 60, position: [0, 1.34, 4.7] }}
      onCreated={({ gl }) => configure(gl)}
    >
      <ContextGuard />
      <SceneRoot materials={materials} />
      <Ready onReady={onReady} />
    </Canvas>
  )
}
