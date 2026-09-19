import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { ContactShadows } from '@react-three/drei'
import { MathUtils, Vector3, type Group, type PerspectiveCamera } from 'three'
import { CHAPTERS } from '@/config/chapters'
import { ENV_KEYS, LIGHT_KEYS } from '@/config/timeline'
import { damp, segmentAt } from '@/lib/math'
import { advancePointer, pointer } from '@/state/pointer'
import { scroll } from '@/state/scroll'
import { useExperience } from '@/state/useExperience'
import { ShoeMaterials } from '@/three/materials/materials'
import { CameraRig } from '@/three/camera/CameraRig'
import { PostFX, applyPost, createPostRig } from '@/three/postprocessing/PostFX'
import type { ProductModel } from '@/three/product/loadModel'
import { Shoe, applyProduct, createProductRig } from '@/three/product/Shoe'
import { Backdrop, applyBackdrop, createBackdropRig } from './Backdrop'
import { Lighting, applyLights, castsShadows, createLightRig } from './Lighting'
import { PerfGuard } from './PerfGuard'
import type { ChapterAlign } from '@/types'

/**
 * The scene, and the one place per frame where anything moves.
 *
 * Five keyframe tables — camera, lights, environment, product, post — are all
 * sampled here from a single scroll value, in a single `useFrame`. That is a
 * deliberate constraint rather than a stylistic one: if each subsystem owned its
 * own frame callback, R3F's subscription order would decide whether the depth of
 * field focused on this frame's camera position or the previous one's, and the
 * answer would change with mount order. One callback, one obvious order.
 *
 * Nothing below allocates, and nothing below touches React state. Every value is
 * pushed straight onto a three.js object.
 */

/** Clamp the frame delta so a background tab or a long GC pause cannot teleport anything. */
const MAX_DT = 1 / 24

/** How fast the reveal eases the camera in once loading finishes. */
const INTRO_LAMBDA = 1.35

/** Slab parallax across the whole page, in world units. */
const SLAB_TRAVEL = 2.2

function Choreographer({
  camera,
  cameraRig,
  materials,
  backdrop,
  lights,
  product,
  post,
  mobile,
}: {
  camera: PerspectiveCamera
  cameraRig: CameraRig
  materials: ShoeMaterials
  backdrop: ReturnType<typeof createBackdropRig>
  lights: ReturnType<typeof createLightRig>
  product: ReturnType<typeof createProductRig>
  post: ReturnType<typeof createPostRig>
  mobile: boolean
}) {
  const gl = useThree((s) => s.gl)
  const reduced = useExperience((s) => s.reducedMotion)
  const phase = useExperience((s) => s.phase)
  const intro = useRef(0)
  const worldCentre = useMemo(() => new Vector3(), [])
  const edge = useMemo(() => new Vector3(), [])

  const revealed = phase === 'reveal' || phase === 'ready'

  useEffect(() => {
    const align = CHAPTERS[scroll.chapter]?.align ?? 'center'
    cameraRig.reset(align, mobile)
  }, [cameraRig, mobile])

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, MAX_DT)
    const progress = scroll.smooth
    const align: ChapterAlign = CHAPTERS[scroll.chapter]?.align ?? 'center'

    intro.current = damp(intro.current, revealed ? 1 : 0, INTRO_LAMBDA, dt)
    advancePointer(dt, reduced)

    // 1. Camera first: everything downstream wants this frame's view, not the last.
    const frame = cameraRig.update(camera, progress, align, intro.current, reduced, mobile, dt)

    // 2. Product transform and the sole's compression state.
    applyProduct(product, progress, reduced)

    // 3. Lighting, including how much the environment map contributes.
    const lightSeg = segmentAt(LIGHT_KEYS, progress)
    const lightT = lightSeg.e
    applyLights(lights, lightSeg.a, lightSeg.b, lightT)
    materials.setEnvIntensity(MathUtils.lerp(lightSeg.a.envIntensity, lightSeg.b.envIntensity, lightT))

    // 4. The room. Fog travels with the camera when a narrow viewport pushed it back.
    const envSeg = segmentAt(ENV_KEYS, progress)
    applyBackdrop(
      backdrop,
      envSeg.a,
      envSeg.b,
      envSeg.e,
      frame.distanceScale,
      (0.5 - progress) * SLAB_TRAVEL - pointer.sx * 0.25,
    )

    // 5. Resolve any in-flight colourway crossfade.
    materials.update(dt)

    // 6. Grade the frame. Exposure is the renderer's, not an effect's, so that
    //    bloom thresholds stay meaningful in display-referred values.
    applyPost(post, progress, frame.distance, reduced)
    gl.toneMappingExposure = post.exposure

    // 7. Is the pointer over the product? Cheaper and steadier than raycasting
    //    75k triangles, and a cursor label does not need triangle accuracy.
    //    An ellipse, not a circle: the shoe is far wider than it is tall.
    const group = product.group
    if (group && pointer.inside) {
      worldCentre.copy(product.centre).applyMatrix4(group.matrixWorld).project(camera)
      edge.copy(product.centre).applyMatrix4(group.matrixWorld)
      edge.x += product.radius
      edge.project(camera)
      const rx = Math.hypot(edge.x - worldCentre.x, edge.y - worldCentre.y)
      edge.copy(product.centre).applyMatrix4(group.matrixWorld)
      edge.y += product.halfHeight
      edge.project(camera)
      const ry = Math.hypot(edge.x - worldCentre.x, edge.y - worldCentre.y)
      const dx = (pointer.nx - worldCentre.x) / (rx || 1)
      const dy = (-pointer.ny - worldCentre.y) / (ry || 1)
      pointer.overProduct = dx * dx + dy * dy < 1
    } else if (pointer.overProduct) {
      pointer.overProduct = false
    }
  })

  return null
}

export interface SceneRootProps {
  materials: ShoeMaterials
  /** A loaded GLB, or `null` for the procedural stand-in. */
  model: ProductModel | null
}

export function SceneRoot({ materials, model }: SceneRootProps) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const width = useThree((s) => s.size.width)
  const profile = useExperience((s) => s.perf)
  const reduced = useExperience((s) => s.reducedMotion)
  const mobile = width <= 860

  const cameraRig = useMemo(() => new CameraRig(), [])
  const backdrop = useMemo(() => createBackdropRig(), [])
  const lights = useMemo(() => createLightRig(profile), [profile])
  const product = useMemo(() => createProductRig(), [])
  const post = useMemo(() => createPostRig(), [])

  const attachSlabs = useMemo(
    () => (group: Group | null) => {
      backdrop.slabs = group
    },
    [backdrop],
  )

  return (
    <>
      <Backdrop rig={backdrop} profile={profile} slabsRef={attachSlabs} />
      <Lighting rig={lights} profile={profile} />
      <Shoe rig={product} materials={materials} profile={profile} model={model} />

      {profile.contactShadows && (
        <ContactShadows
          name="contact-shadow"
          position={[0, 0.006, 0]}
          scale={[4.6, 2.4]}
          resolution={profile.contactShadowRes}
          far={1.1}
          blur={2.6}
          opacity={0.72}
          color="#000000"
        />
      )}

      <Choreographer
        camera={camera}
        cameraRig={cameraRig}
        materials={materials}
        backdrop={backdrop}
        lights={lights}
        product={product}
        post={post}
        mobile={mobile}
      />

      <PostFX rig={post} profile={profile} reduced={reduced} />
      <PerfGuard />
    </>
  )
}

export { castsShadows }
