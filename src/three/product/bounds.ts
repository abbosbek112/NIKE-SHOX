import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three'
import { PRODUCT_KEYS } from '@/config/timeline'
import { segmentAt } from '@/lib/math'

/**
 * How big the shoe is, and which way it is facing.
 *
 * Two systems outside the product itself need to know both: the cursor's
 * over-product test, and the camera's containment fit. Both read them from
 * `productBounds` rather than off the live `Object3D`, which keeps them
 * independent of mount order, of R3F's frame order, and — for the camera — of
 * the user's drag.
 *
 * The numbers below are the *procedural* shoe's, measured once off the built
 * geometry: every vertex of every visible mesh transformed into the product
 * group's own space.
 *
 *     min  [-1.3114, 0, -0.4213]      max  [1.3116, 0.9882, 0.4714]
 *
 * x runs heel to toe, y sits on the floor, z is the width across the sole. They
 * are the starting value, not the only one: drop a real `shox.glb` into
 * `public/models/` and the loader measures it the same way at load time and calls
 * `setProductBounds`, so nothing here has to be re-transcribed by hand.
 */
const PROCEDURAL_BOX = {
  min: [-1.3114, 0, -0.4213],
  max: [1.3116, 0.9882, 0.4714],
} as const

/**
 * The procedural silhouette's footprint: the convex hull of the whole shoe
 * projected onto the floor, as flat (x, z) pairs. The camera's containment fit
 * walks this every frame, at both ends of `hullY`.
 *
 * The box's eight corners will not do here, which is worth explaining because they
 * are the obvious thing to reach for. A shoe is narrow at the heel — ±0.04 across,
 * against ±0.44 at the midfoot — so the box corner above the heel sits a third of a
 * unit off any real surface, and in a three-quarter view that phantom is what the
 * fit measures. It read the shop chapter as 0.14 NDC wider than the shoe really
 * projects, enough to pan a frame that measurement shows is already clear.
 *
 * Kept exact, at the resolution it was measured: forty-six points is nothing to
 * loop over, and a support value is read off this, so a millimetre of inward slip
 * is a crop the fit would never see.
 */
export const PROCEDURAL_HULL = Float32Array.of(
  // heel, then round the medial side toward the toe
  -1.3114, 0.0383, -1.3114, -0.0383, -1.3114, -0.0388, -1.2879, -0.1335,
  -1.2646, -0.2052, -1.2036, -0.2495, -1.0917, -0.3144, -1.0371, -0.3423,
  -0.9825, -0.355, -0.9279, -0.365, -0.8733, -0.3701, 0.6004, -0.4211,
  0.655, -0.4213, 0.7096, -0.4188, 0.7642, -0.415, 0.8188, -0.4096,
  0.8733, -0.4005, 0.9279, -0.3894, 0.9825, -0.3748, 1.0371, -0.3563,
  1.0917, -0.3234, 1.2282, -0.2056, 1.2753, -0.1363, 1.3116, 0.0197,
  // toe, then back down the lateral side
  1.3116, 0.0723, 1.2752, 0.2254, 1.2278, 0.2914, 1.0917, 0.3982,
  1.0371, 0.4263, 0.9825, 0.4404, 0.9279, 0.451, 0.8733, 0.4589,
  0.8188, 0.4652, 0.7642, 0.4684, 0.7096, 0.4705, 0.655, 0.4714,
  0.6004, 0.47, -0.8733, 0.3814, -0.9279, 0.3747, -0.9825, 0.3632,
  -1.0371, 0.3491, -1.0917, 0.3198, -1.2036, 0.253, -1.2646, 0.2087,
  -1.2879, 0.137, -1.3114, 0.0388,
)

export interface ProductBounds {
  min: readonly [number, number, number]
  max: readonly [number, number, number]
  /** Footprint on the floor plane, as flat (x, z) pairs. */
  hull: Float32Array
  /**
   * Floor and collar. Extruding the footprint between the two is a prism that
   * contains the shoe — loose over the toe box, but loose *outwards*, which is the
   * safe direction for a fit whose job is to not crop.
   */
  hullY: readonly [number, number]
  halfX: number
  halfY: number
  centreY: number
}

/**
 * The live bounds. Mutable, and read every frame by the camera fit and the
 * cursor test, so replacing them mid-session — which is exactly what loading a
 * model does — needs no re-wiring anywhere.
 */
export const productBounds: ProductBounds = derive(PROCEDURAL_BOX.min, PROCEDURAL_BOX.max, PROCEDURAL_HULL)

function derive(
  min: readonly [number, number, number] | readonly number[],
  max: readonly [number, number, number] | readonly number[],
  hull: Float32Array,
): ProductBounds {
  return {
    min: [min[0], min[1], min[2]],
    max: [max[0], max[1], max[2]],
    hull,
    hullY: [min[1], max[1]],
    halfX: (max[0] - min[0]) / 2,
    halfY: (max[1] - min[1]) / 2,
    centreY: (max[1] + min[1]) / 2,
  }
}

/** Adopt a measured model's extents in place of the procedural shoe's. */
export function setProductBounds(measured: {
  min: [number, number, number]
  max: [number, number, number]
  hull: Float32Array
}): void {
  Object.assign(productBounds, derive(measured.min, measured.max, measured.hull))
}

const pos = new Vector3()
const euler = new Euler()
const quat = new Quaternion()
const scale = new Vector3()

/**
 * The product's *authored* pose at a progress: `PRODUCT_KEYS`, and nothing else.
 *
 * Deliberately not the live group's matrix. The camera is updated before the
 * product each frame, so that matrix would be one frame stale — and, more to the
 * point, it carries the user's drag and the kinetic lean. A camera fit that
 * followed those would let turning the shoe by hand shove the camera around.
 */
export function productPose(progress: number, out: Matrix4): Matrix4 {
  const { a, b, e } = segmentAt(PRODUCT_KEYS, progress)
  euler.set(
    MathUtils.lerp(a.rotation[0], b.rotation[0], e),
    MathUtils.lerp(a.rotation[1], b.rotation[1], e),
    MathUtils.lerp(a.rotation[2], b.rotation[2], e),
  )
  pos.set(
    MathUtils.lerp(a.position[0], b.position[0], e),
    MathUtils.lerp(a.position[1], b.position[1], e),
    MathUtils.lerp(a.position[2], b.position[2], e),
  )
  scale.setScalar(MathUtils.lerp(a.scale, b.scale, e))
  return out.compose(pos, quat.setFromEuler(euler), scale)
}
