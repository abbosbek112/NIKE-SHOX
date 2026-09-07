import { useEffect, useMemo, useRef } from 'react'
import { MathUtils, Vector3, type Group } from 'three'
import { PRODUCT_KEYS } from '@/config/timeline'
import { segmentAt } from '@/lib/math'
import { pointer } from '@/state/pointer'
import { scroll } from '@/state/scroll'
import type { ShoeMaterials } from '@/three/materials/materials'
import { productBounds } from '@/three/product/bounds'
import { castsShadows } from '@/three/scene/Lighting'
import type { PerfProfile } from '@/types'
import type { ProductModel } from './loadModel'
import { ModelShoe } from './ModelShoe'
import { ProceduralShoe, type ShoeHandle } from './ProceduralShoe'

/**
 * The product rig: the shoe's own transform, layered on top of the camera move.
 *
 * Three things are combined here, in this order:
 *
 * 1. `PRODUCT_KEYS` — the authored performance. Rotation about y is interpolated
 *    raw rather than by shortest path so the movement chapter's full revolution
 *    reads as a real spin.
 * 2. The user's drag. Additive, so dragging never fights the timeline: let go and
 *    the shoe is still exactly where the scroll says it should be, plus whatever
 *    the user turned it by.
 * 3. Scroll velocity. A few degrees of lean into the direction of travel. This is
 *    feedback, not decoration — it is the only thing on screen that tells you the
 *    scene is responding to *how* you scroll rather than just where you are.
 *
 * ---
 *
 * Geometry source. With no file at `MODEL.url` the mesh below is `ProceduralShoe`:
 * real `BufferGeometry` built in code, not a scan or a licensed asset, and not a
 * photograph on a plane. It is a faithful *stand-in* for a Shox TL, not the
 * production model.
 *
 * Drop a `shox.glb` into `public/models/` and `ModelShoe` renders instead, with no
 * other edit anywhere. `loadModel.ts` turns the file onto the timeline's axes,
 * scales it to length, stands it on the floor, matches its meshes to material zones
 * by name and measures its silhouette into `productBounds` — so the cursor's hit
 * test and the camera's containment fit follow the new shape on their own. Both
 * components satisfy the same `ShoeHandle` contract; a model with no separable
 * parts no-ops `apply` and still reads correctly in every other chapter.
 */

/** Yaw and roll added at full scroll velocity. */
const KINETIC_YAW = 0.07
const KINETIC_ROLL = 0.024

/**
 * Slack on the product's half-extents for the cursor's over-product test. The
 * silhouette is `PRODUCT_HALF_X` × `PRODUCT_HALF_Y`; the ellipse is a little wider
 * so `DRAG` engages as the pointer reaches the shoe rather than flickering along
 * its edge, and so it survives the kinetic lean.
 */
const HIT_PAD = 1.08

export interface ProductRig {
  group: Group | null
  handle: ShoeHandle | null
  /** World-space centre, for the cursor's over-product test. */
  readonly centre: Vector3
  /**
   * Half-extents of the product's screen footprint, in world units. A single
   * bounding-sphere radius would be half the shoe's *length* — a circle roughly
   * three times taller than the shoe, which put the `DRAG` label over the
   * headline below it. Two numbers make the test an ellipse instead.
   */
  radius: number
  halfHeight: number
}

export function createProductRig(): ProductRig {
  return {
    group: null,
    handle: null,
    centre: new Vector3(0, productBounds.centreY, 0),
    radius: productBounds.halfX * HIT_PAD,
    halfHeight: productBounds.halfY * HIT_PAD,
  }
}

/** Sample the product timeline and push it onto the rig. */
export function applyProduct(rig: ProductRig, progress: number, reduced: boolean): void {
  const seg = segmentAt(PRODUCT_KEYS, progress)
  const t = seg.e
  const a = seg.a
  const b = seg.b

  const compress = MathUtils.lerp(a.compress, b.compress, t)
  const explode = MathUtils.lerp(a.explode, b.explode, t)

  const group = rig.group
  if (group) {
    const kinetic = reduced ? 0 : scroll.kinetic
    group.rotation.set(
      MathUtils.lerp(a.rotation[0], b.rotation[0], t) + (reduced ? 0 : pointer.dragPitch),
      MathUtils.lerp(a.rotation[1], b.rotation[1], t) + (reduced ? 0 : pointer.dragYaw) + kinetic * KINETIC_YAW,
      MathUtils.lerp(a.rotation[2], b.rotation[2], t) + kinetic * KINETIC_ROLL,
    )
    group.position.set(
      MathUtils.lerp(a.position[0], b.position[0], t),
      MathUtils.lerp(a.position[1], b.position[1], t),
      MathUtils.lerp(a.position[2], b.position[2], t),
    )
    const scale = MathUtils.lerp(a.scale, b.scale, t)
    group.scale.setScalar(scale)
    // Read every frame rather than captured once: a loaded model publishes its own
    // extents from `boot`, which can land after the rig was created.
    rig.centre.y = productBounds.centreY * scale + group.position.y
    rig.radius = productBounds.halfX * HIT_PAD * scale
    rig.halfHeight = productBounds.halfY * HIT_PAD * scale
  }

  rig.handle?.apply(compress, explode)
}

export interface ShoeProps {
  rig: ProductRig
  materials: ShoeMaterials
  profile: PerfProfile
  /** A loaded GLB, or `null` for the procedural stand-in. */
  model: ProductModel | null
}

export function Shoe({ rig, materials, profile, model }: ShoeProps) {
  const handle = useRef<ShoeHandle>(null)

  const attachGroup = useMemo(
    () => (group: Group | null) => {
      rig.group = group
    },
    [rig],
  )

  // The imperative handle is only available after the child has mounted, so it is
  // published on the rig in an effect rather than during render.
  useEffect(() => {
    rig.handle = handle.current
    // Seed the transform so the very first frame is composed, not default.
    applyProduct(rig, scroll.smooth, false)
    return () => {
      rig.handle = null
    }
  }, [rig, model])

  return (
    <group name="product" ref={attachGroup}>
      {model ? (
        <ModelShoe ref={handle} model={model} shadows={castsShadows(profile)} />
      ) : (
        <ProceduralShoe
          ref={handle}
          materials={materials}
          detail={profile.geometryDetail}
          shadows={castsShadows(profile)}
        />
      )}
    </group>
  )
}
