import { Vector3 } from 'three'
import { buildSurfaceGrid, type MeshBuffer, type SurfaceFn } from './builders'
import {
  HEEL_X,
  SHOE_LENGTH,
  lateralHalfWidth,
  medialHalfWidth,
  centreZ,
  soleTopAt,
  spline1d,
} from './last'

/**
 * The sole stack, bottom to top:
 *
 *   rubber outsole → lower TPU plate → SHOX COLUMNS → upper TPU plate → foam chassis
 *
 * Each layer is a lofted slab with its own flare, which is what gives the
 * midsole its stepped, engineered profile instead of a single soft wedge.
 * Layer heights are exported because the column array has to land exactly
 * between the two plates.
 */

/** Ground line: heel bevel at the back, toe spring at the front. */
const SOLE_BOTTOM = spline1d([
  [0.0, 0.034],
  [0.04, 0.01],
  [0.09, 0.001],
  [0.2, 0.0],
  [0.78, 0.0],
  [0.85, 0.009],
  [0.91, 0.03],
  [0.96, 0.072],
  [1.0, 0.122],
])

/** Foam wedge between the upper plate and the upper — thicker under the heel. */
const CHASSIS_THICKNESS = spline1d([
  [0.0, 0.064],
  [0.2, 0.06],
  [0.45, 0.052],
  [0.7, 0.046],
  [1.0, 0.042],
])

/**
 * Layer thicknesses. `OUTSOLE_T + LOWER_PLATE_T` is what fixes `lowerPlateTopAt`,
 * and therefore where the column array, the upper plate, the chassis and the whole
 * upper sit — so the two trade against each other freely. The rubber is the thicker
 * of the pair because it has to house the tread relief below.
 */
const OUTSOLE_T = 0.04
const LOWER_PLATE_T = 0.022
const UPPER_PLATE_T = 0.032

/**
 * Depth of the tread relief. The outsole shell's underside is raised by this
 * much and the rubber lugs in `tread.ts` fill the space back down to the ground
 * line — so the shoe's contact plane and overall stack height are exactly what
 * they were when the outsole was one featureless slab.
 */
const TREAD_T = 0.026

/** How far each layer stands proud of the last. The plates are the widest. */
const FLARE = {
  outsole: 0.036,
  lowerPlate: 0.046,
  upperPlate: 0.053,
  chassis: 0.026,
} as const

/**
 * Plan-view taper so the heel and toe round off instead of ending square.
 *
 * The floors matter as much as the curve: at the tips the taper still has to leave
 * the sole standing slightly proud of the last, or the upper overhangs its own sole
 * and the shoe reads as a spike from below. At u = 0 the last is 0.038 half-wide, so
 * 0.62 × (0.038 + flare) keeps every layer outside it.
 */
const TIP_TAPER = spline1d([
  [0.0, 0.62],
  [0.02, 0.72],
  [0.05, 0.86],
  [0.1, 1.0],
  [0.9, 1.0],
  [0.95, 0.9],
  [0.98, 0.72],
  [1.0, 0.52],
])

export const soleBottomAt = (u: number): number => SOLE_BOTTOM(u)
/** Underside of the outsole *shell* — the recessed floor the lugs stand out of. */
export const outsoleBottomAt = (u: number): number => SOLE_BOTTOM(u) + TREAD_T
export const outsoleTopAt = (u: number): number => SOLE_BOTTOM(u) + OUTSOLE_T
export const lowerPlateTopAt = (u: number): number => outsoleTopAt(u) + LOWER_PLATE_T
export const chassisBottomAt = (u: number): number => soleTopAt(u) - CHASSIS_THICKNESS(u)
export const upperPlateBottomAt = (u: number): number => chassisBottomAt(u) - UPPER_PLATE_T
/** Vertical room available for a column at this station. */
export const columnSpanAt = (u: number): number => upperPlateBottomAt(u) - lowerPlateTopAt(u)

export interface SlabSpec {
  yLow: (u: number) => number
  yHigh: (u: number) => number
  flare: number
  /** Section corner sharpness. 6 reads as a machined edge, 3 as moulded foam. */
  exponent?: number
  uRange?: readonly [number, number]
  /** Shrink the section near the tips so the end caps stay small. */
  taper?: boolean
}

/**
 * A sole layer as a lofted slab. Same closed-section maths as the last, with a
 * high superellipse exponent so the walls stay flat and the edges stay crisp.
 */
export function slabSurface(spec: SlabSpec): SurfaceFn {
  const { yLow, yHigh, flare, exponent = 6, taper = true } = spec
  return (u, v, out) => {
    const t = taper ? TIP_TAPER(u) : 1
    const low = yLow(u)
    const high = yHigh(u)
    const mid = (low + high) / 2
    const halfY = Math.max(0.002, (high - low) / 2)
    const hzLat = Math.max(0.004, (lateralHalfWidth(u) + flare) * t)
    const hzMed = Math.max(0.004, (medialHalfWidth(u) + flare) * t)
    const phi = v * Math.PI * 2 - Math.PI / 2
    const sn = Math.sin(phi)
    const cs = Math.cos(phi)
    const e = 2 / exponent
    const sy = Math.sign(sn) * Math.pow(Math.abs(sn), e)
    const sz = Math.sign(cs) * Math.pow(Math.abs(cs), e)
    return out.set(HEEL_X + u * SHOE_LENGTH, mid + sy * halfY, centreZ(u) - sz * (cs >= 0 ? hzLat : hzMed))
  }
}

export function buildSlab(spec: SlabSpec, uCount: number, vCount: number): MeshBuffer {
  return buildSurfaceGrid(slabSurface(spec), uCount, vCount, {
    uRange: spec.uRange ?? [0, 1],
    capStart: true,
    capEnd: true,
    uv: (u, v) => [u * 3.2, v * 1.6],
  })
}

/** The outsole shell, as one spec, so the tread can measure the floor it grows from. */
const OUTSOLE_SPEC: SlabSpec = {
  yLow: outsoleBottomAt,
  yHigh: outsoleTopAt,
  flare: FLARE.outsole,
  exponent: 5,
}

/** Plan half-width of the outsole at a station, taper included. */
export function outsoleHalfZ(u: number, side: 1 | -1): number {
  const half = side < 0 ? lateralHalfWidth(u) : medialHalfWidth(u)
  return Math.max(0.004, (half + FLARE.outsole) * TIP_TAPER(u))
}

/**
 * Height of the outsole shell's underside directly above a point on the ground.
 *
 * `slabSurface` gives the section as a function of its own angle; a lug needs the
 * inverse — the height of the bottom half at a known `z`. Inverting the
 * superellipse is exact, which is what lets a lug's top sit flush inside the
 * shell however the sole's width or flare is retuned.
 */
export function outsoleShellBottomY(u: number, z: number): number {
  const low = outsoleBottomAt(u)
  const high = outsoleTopAt(u)
  const mid = (low + high) / 2
  const halfY = Math.max(0.002, (high - low) / 2)
  const dz = z - centreZ(u)
  const hz = outsoleHalfZ(u, dz <= 0 ? -1 : 1)
  const e = 2 / (OUTSOLE_SPEC.exponent ?? 6)
  const cs = Math.pow(Math.min(1, Math.abs(dz) / hz), 1 / e)
  const sn = Math.sqrt(Math.max(0, 1 - cs * cs))
  return mid - Math.pow(sn, e) * halfY
}

export interface SoleGeometry {
  outsole: MeshBuffer
  lowerPlate: MeshBuffer
  upperPlate: MeshBuffer
  chassis: MeshBuffer
}

export function buildSole(detail: number): SoleGeometry {
  const uCount = Math.round(96 * detail)
  const vCount = Math.round(30 * detail)
  return {
    outsole: buildSlab(OUTSOLE_SPEC, uCount, vCount),
    lowerPlate: buildSlab(
      { yLow: outsoleTopAt, yHigh: lowerPlateTopAt, flare: FLARE.lowerPlate, exponent: 7 },
      uCount,
      vCount,
    ),
    upperPlate: buildSlab(
      { yLow: upperPlateBottomAt, yHigh: chassisBottomAt, flare: FLARE.upperPlate, exponent: 7 },
      uCount,
      vCount,
    ),
    chassis: buildSlab(
      { yLow: chassisBottomAt, yHigh: soleTopAt, flare: FLARE.chassis, exponent: 3.4 },
      uCount,
      vCount,
    ),
  }
}

/** Half-width available for placing a column ring at this station. */
export function columnTrackHalf(u: number, side: 1 | -1): number {
  return (side < 0 ? lateralHalfWidth(u) : medialHalfWidth(u)) + FLARE.lowerPlate
}

/**
 * A point on the outer edge of the upper plate. Hotspot leader lines start here
 * so their anchors move with the sole rather than floating in space.
 * `side` is -1 for lateral (outside) and +1 for medial.
 */
export function platePoint(u: number, side: 1 | -1): Vector3 {
  const half = side < 0 ? lateralHalfWidth(u) : medialHalfWidth(u)
  const z = centreZ(u) + side * (half + FLARE.upperPlate)
  return new Vector3(HEEL_X + u * SHOE_LENGTH, (chassisBottomAt(u) + upperPlateBottomAt(u)) / 2, z)
}
