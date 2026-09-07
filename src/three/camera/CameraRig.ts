import { MathUtils, Matrix4, Vector3, type PerspectiveCamera } from 'three'
import { CAMERA_KEYS, FRAMING_SHIFT } from '@/config/timeline'
import { damp, invLerp, segmentAt, smoothstep } from '@/lib/math'
import { productBounds, productPose } from '@/three/product/bounds'
import { pointer } from '@/state/pointer'
import type { ChapterAlign } from '@/types'

/**
 * The camera.
 *
 * Position, target, focal length and roll all come from `CAMERA_KEYS`, sampled
 * by scroll progress, so the seven chapters are one continuous move rather than
 * seven cuts. On top of that the rig adds four things the keyframe table cannot
 * know about:
 *
 * 1. **Aspect fitting.** The table is authored against a 16:9 frame. A phone in
 *    portrait sees roughly a quarter of that horizontal extent, which would crop
 *    a 2.6-unit-long sneaker down to the midsole. `fitCorrection` widens the lens
 *    and pulls the camera back until the same amount of shoe is in frame, split
 *    between the two so neither the perspective distortion nor the loss of
 *    presence gets extreme.
 * 2. **Framing shift.** A lateral pan of eye *and* target so the product sits
 *    opposite the chapter's copy. Damped, so re-aligning between chapters eases.
 * 3. **Containment.** A shot marked `contain` measures where the product's
 *    silhouette actually lands and holds it inside the frame — by panning less
 *    than the chapter asked for, and only if that is not enough, by pulling back.
 *    A keyframe cannot do this itself: how wide the shoe projects depends on how
 *    far it has turned, on the viewport's aspect, and on the pan.
 * 4. **Pointer parallax.** A few centimetres of eye movement, target held. Enough
 *    that the room feels like it has depth when the mouse moves; small enough
 *    that nobody would call it a camera animation.
 */

/** Aspect ratio every camera keyframe was composed against. */
const REF_ASPECT = 16 / 9

/**
 * Fraction of the reference horizontal extent to preserve. Narrow viewports keep
 * slightly less: cropping a few millimetres off the heel and toe reads as an
 * intentional editorial crop, whereas the alternative — a 90° lens, or a camera
 * so far back the shoe loses all presence — reads as a mistake.
 */
const fitTarget = (aspect: number): number => 0.82 + 0.1 * smoothstep(invLerp(0.55, 0.85, aspect))

/**
 * Split the correction between focal length and distance. Distance carries a
 * little more of it so phones do not end up with a fisheye lens.
 */
const FOV_SHARE = 0.45
const DIST_SHARE = 0.55

function fitCorrection(aspect: number): { fov: number; dist: number } {
  if (aspect >= REF_ASPECT) return { fov: 1, dist: 1 }
  const s = Math.max(1, (REF_ASPECT / aspect) * fitTarget(aspect))
  return { fov: Math.pow(s, FOV_SHARE), dist: Math.pow(s, DIST_SHARE) }
}

/** Pointer parallax reach, in world units, at the reference distance. */
const PARALLAX_X = 0.1
const PARALLAX_Y = 0.06

/**
 * Widest the product may project, in NDC, in a shot that asks to be contained.
 *
 * Not 1.0: a silhouette that ends exactly on the frame edge reads as though it
 * were about to be cut. Not 0.94 either — the shape chapter's orbit is composed by
 * hand to come within 0.944 of the edge, and a tighter margin here would pan a
 * shot that is already right.
 */
const CONTAIN_NDC = 0.96

/**
 * Ceiling on the dolly-back, as a multiple of the authored distance. A runaway
 * guard, not a framing decision: for the current table the fit never asks for any
 * pull-back at all, because reducing the pan is always enough.
 */
const CONTAIN_MAX_DOLLY = 2

/** Scratch for the containment solve. */
const pose = new Matrix4()
const point = new Vector3()

interface ContainFit {
  /** Camera-to-target distance after the fit. */
  distance: number
  /** Pan window, in half-widths, that keeps the silhouette inside the frame. */
  min: number
  max: number
}

const containFit: ContainFit = { distance: 0, min: -Infinity, max: Infinity }

export interface CameraFrame {
  /** Eased position within the current camera segment, for debug overlays. */
  label: string
  /** Camera-to-target distance after aspect fitting — drives fog and DOF. */
  distance: number
  /** Distance multiplier applied by aspect fitting, so fog can scale with it. */
  distanceScale: number
}

export class CameraRig {
  private readonly eye = new Vector3()
  private readonly target = new Vector3()
  private readonly right = new Vector3()
  private readonly up = new Vector3()
  private readonly forward = new Vector3()
  private readonly worldUp = new Vector3(0, 1, 0)

  /** Damped state, so chapter changes and pointer moves ease rather than snap. */
  private shift = 0
  private parallaxX = 0
  private parallaxY = 0

  private lastFov = -1
  readonly frame: CameraFrame = { label: '', distance: 4.7, distanceScale: 1 }

  /**
   * @param progress   normalised scroll progress
   * @param align      the active chapter's copy alignment
   * @param intro      0 during the loader, 1 once the hero has settled
   * @param reduced    honour `prefers-reduced-motion`: no roll, no parallax
   */
  update(
    camera: PerspectiveCamera,
    progress: number,
    align: ChapterAlign,
    intro: number,
    reduced: boolean,
    mobile: boolean,
    dt: number,
  ): CameraFrame {
    const seg = segmentAt(CAMERA_KEYS, progress)
    const t = seg.e
    const a = seg.a
    const b = seg.b

    this.eye.set(
      MathUtils.lerp(a.position[0], b.position[0], t),
      MathUtils.lerp(a.position[1], b.position[1], t),
      MathUtils.lerp(a.position[2], b.position[2], t),
    )
    this.target.set(
      MathUtils.lerp(a.target[0], b.target[0], t),
      MathUtils.lerp(a.target[1], b.target[1], t),
      MathUtils.lerp(a.target[2], b.target[2], t),
    )
    const fovDeg = MathUtils.lerp(a.fov, b.fov, t)
    const roll = reduced ? 0 : MathUtils.lerp(a.roll ?? 0, b.roll ?? 0, t)

    // --- aspect fitting -----------------------------------------------------
    const fit = fitCorrection(camera.aspect)
    const halfFov = MathUtils.degToRad(fovDeg) * 0.5
    const fittedFov = 2 * Math.atan(Math.tan(halfFov) * fit.fov)

    this.forward.subVectors(this.eye, this.target)
    const authored = this.forward.length() * fit.dist + (1 - intro) * 0.9
    this.forward.normalize()

    // --- basis --------------------------------------------------------------
    // Matches three's lookAt: z = normalise(eye - target), x = up × z, y = z × x.
    // Resolved before the eye is placed, because the containment fit measures the
    // silhouette against these axes.
    this.right.crossVectors(this.worldUp, this.forward).normalize()
    this.up.crossVectors(this.forward, this.right)

    // --- containment --------------------------------------------------------
    // `T` is the visible half-width one unit in front of the camera.
    const T = Math.tan(fittedFov * 0.5) * camera.aspect
    const contain = MathUtils.lerp(a.contain ?? 0, b.contain ?? 0, t)
    const wantShift = mobile ? 0 : FRAMING_SHIFT[align]
    let distance = authored
    let aim = wantShift
    let panLo = -Infinity
    let panHi = Infinity
    if (contain > 0) {
      const c = this.containment(progress, T, authored, contain)
      distance = c.distance
      panLo = c.min
      panHi = c.max
      aim = MathUtils.lerp(wantShift, this.hold(wantShift, panLo, panHi), contain)
    }

    this.eye.copy(this.target).addScaledVector(this.forward, distance)

    // --- framing shift ------------------------------------------------------
    this.shift = damp(this.shift, aim, 3.4, dt)
    // Damping lags, and in the colour chapter the lag lands on the frame where the
    // shoe turns broadside and projects longest — so the window is enforced on the
    // damped value too, weighted by `contain` so a shot easing into containment is
    // eased rather than yanked.
    if (contain > 0) {
      this.shift = MathUtils.lerp(this.shift, this.hold(this.shift, panLo, panHi), contain)
    }
    if (this.shift !== 0) {
      const world = this.shift * T * distance
      this.eye.addScaledVector(this.right, world)
      this.target.addScaledVector(this.right, world)
    }

    // --- pointer parallax ---------------------------------------------------
    const reach = reduced || !pointer.inside ? 0 : 1
    this.parallaxX = damp(this.parallaxX, pointer.sx * reach, 4, dt)
    this.parallaxY = damp(this.parallaxY, pointer.sy * reach, 4, dt)
    if (this.parallaxX !== 0 || this.parallaxY !== 0) {
      const scale = distance / 4.7
      this.eye.addScaledVector(this.right, this.parallaxX * PARALLAX_X * scale)
      this.eye.addScaledVector(this.up, -this.parallaxY * PARALLAX_Y * scale)
    }

    // --- commit -------------------------------------------------------------
    camera.position.copy(this.eye)
    camera.up.copy(this.worldUp)
    camera.lookAt(this.target)
    if (roll !== 0) camera.rotateZ(roll)

    const deg = MathUtils.radToDeg(fittedFov) + (1 - intro) * 2.5
    if (Math.abs(deg - this.lastFov) > 1e-3) {
      camera.fov = deg
      camera.updateProjectionMatrix()
      this.lastFov = deg
    }

    this.frame.label = b.label
    this.frame.distance = distance
    // Fog and depth of field key off the real distance, containment included.
    this.frame.distanceScale = fit.dist * (distance / authored)
    return this.frame
  }

  /**
   * Where the pan may sit: `want` if the window allows it, otherwise the nearest
   * edge of the window. An empty window means the product cannot be held whole at
   * this distance — which happens while `contain` is ramping in, since the distance
   * is only part-way to what the silhouette needs. Centre it there, so the overflow
   * is split between the two edges instead of one being chosen to crop.
   */
  private hold(want: number, lo: number, hi: number): number {
    return lo > hi ? (lo + hi) * 0.5 : MathUtils.clamp(want, lo, hi)
  }

  /**
   * Measure the product's silhouette and work out what the shot must do to keep it
   * whole: how far back the camera has to sit, and how far it may then pan.
   *
   * For a silhouette point `p`, with the camera on the target's forward axis at
   * distance `d` and panned `s` half-widths along `right`:
   *
   *     A = (p − target)·right      B = (p − target)·forward
   *     ndcX = (A − s·T·d) / ((d − B)·T)
   *
   * Requiring |ndcX| ≤ m is linear in both `s` and `d`, and the two frame edges
   * separate cleanly, so the whole fit collapses to two support values over the
   * silhouette — how far it reaches past the right edge and past the left:
   *
   *     reachR = max(A + mT·B)      reachL = max(mT·B − A)
   *
   * from which the distance that would just contain a centred product is
   * `(reachR + reachL) / 2mT`, and the pan window at any distance is
   * `[(reachR − mT·d)/Td, (mT·d − reachL)/Td]`. An empty window means the point set
   * cannot be held whole at that distance; `hold` centres it there.
   *
   * Only the horizontal constraint is enforced. Every shot in the film is wider
   * than it is tall around a shoe 2.6 long and 1.0 high, so horizontal binds first
   * by a wide margin; roll is ignored for the same reason, never exceeding 2° and
   * only in a chapter with ~0.3 of NDC margin to give.
   */
  private containment(progress: number, T: number, authored: number, contain: number): ContainFit {
    productPose(progress, pose)
    const mT = CONTAIN_NDC * T
    const hull = productBounds.hull
    const hullY = productBounds.hullY

    let reachR = -Infinity
    let reachL = -Infinity
    for (let i = 0; i < hull.length; i += 2) {
      // Both ends of the prism: the camera looks down in most shots and up in a
      // couple, so which one reaches furthest is not fixed.
      for (let k = 0; k < 2; k++) {
        point
          .set(hull[i], hullY[k], hull[i + 1])
          .applyMatrix4(pose)
          .sub(this.target)
        const A = point.dot(this.right)
        const B = mT * point.dot(this.forward)
        if (A + B > reachR) reachR = A + B
        if (B - A > reachL) reachL = B - A
      }
    }

    // Reducing the pan comes first and the dolly is the fallback: the pan is an
    // adjustment layer, the distance is the shot. So the camera only moves back if a
    // *centred* product would still not fit, and even then only as far as `contain`
    // asks — a shot easing into containment eases into the pull-back with it.
    const needed = (reachR + reachL) / (2 * mT)
    const fitted = MathUtils.lerp(authored, Math.min(Math.max(authored, needed), authored * CONTAIN_MAX_DOLLY), contain)

    containFit.distance = fitted
    containFit.min = (reachR - mT * fitted) / (T * fitted)
    containFit.max = (mT * fitted - reachL) / (T * fitted)
    return containFit
  }

  /** Snap damped state so the first frame after a resize or reveal is correct. */
  reset(align: ChapterAlign, mobile: boolean): void {
    this.shift = mobile ? 0 : FRAMING_SHIFT[align]
    this.parallaxX = 0
    this.parallaxY = 0
    this.lastFov = -1
  }
}
