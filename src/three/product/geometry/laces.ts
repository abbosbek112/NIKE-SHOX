import { Vector3 } from 'three'
import {
  mergeBuffers,
  surfaceFrame,
  sweepRibbon,
  type MeshBuffer,
  type RibbonNode,
} from './builders'
import { lastSurface, throatHalf } from './last'

/**
 * Lacing: flat laces plus the webbing loops they thread through.
 *
 * The Shox TL uses webbing loops rather than punched eyelets, which is lucky —
 * a loop is a real object, so the laces have something to actually pass through
 * instead of floating above the throat.
 */

export const EYELET_COUNT = 6
const EYELET_U0 = 0.305
const EYELET_U1 = 0.615

export const eyeletU = (i: number): number =>
  EYELET_U0 + ((EYELET_U1 - EYELET_U0) * i) / (EYELET_COUNT - 1)

/** v of a webbing loop: just outside the lacing edge. */
const loopV = (u: number, side: 1 | -1): number =>
  side < 0 ? 0.5 - (throatHalf(u) + 0.026) : 0.5 + (throatHalf(u) + 0.026)

const LOOP_REACH = 0.042
const LOOP_RISE = 0.03

/**
 * Nodes along a path drawn on the last with a per-sample lift, so a lace can
 * rise through a loop at both ends and sag onto the tongue in between.
 */
function liftedPath(
  path: (t: number) => [number, number, number],
  segments: number,
  halfWidth: (t: number) => number,
  halfThick: (t: number) => number,
): RibbonNode[] {
  const points: Vector3[] = []
  const normals: Vector3[] = []
  for (let i = 0; i <= segments; i++) {
    const [u, v, lift] = path(i / segments)
    const frame = surfaceFrame(lastSurface, u, v)
    points.push(frame.position.clone().addScaledVector(frame.normal, lift))
    normals.push(frame.normal.clone())
  }
  return points.map((position, i) => {
    const t = i / segments
    const prev = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]
    const tangent = new Vector3().subVectors(next, prev)
    if (tangent.lengthSq() < 1e-9) tangent.copy(normals[i]).cross(new Vector3(1, 0, 0))
    return {
      position,
      normal: normals[i],
      tangent: tangent.normalize(),
      halfWidth: halfWidth(t),
      halfThick: halfThick(t),
    }
  })
}

/** One webbing loop: a flat strap arching out of the eyestay. */
function buildLoop(u: number, side: 1 | -1): MeshBuffer {
  const v = loopV(u, side)
  const frame = surfaceFrame(lastSurface, u, v)
  const nodes: RibbonNode[] = []
  const steps = 12
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI
    const position = frame.position
      .clone()
      .addScaledVector(frame.tangentU, Math.cos(a) * LOOP_REACH)
      .addScaledVector(frame.normal, Math.sin(a) * LOOP_RISE + 0.0015)
    const tangent = new Vector3()
      .addScaledVector(frame.tangentU, -Math.sin(a) * LOOP_REACH)
      .addScaledVector(frame.normal, Math.cos(a) * LOOP_RISE)
      .normalize()
    // Thin radially, wide across the shoe — a strap, not a cord.
    nodes.push({
      position,
      normal: frame.tangentV.clone(),
      tangent,
      halfWidth: 0.0032,
      halfThick: 0.021,
    })
  }
  return sweepRibbon(nodes, 8, { caps: true, exponent: 5 })
}

export function buildWebbing(): MeshBuffer {
  const buffers: MeshBuffer[] = []
  const sides: (1 | -1)[] = [-1, 1]
  for (let i = 0; i < EYELET_COUNT; i++) {
    sides.forEach((side) => buffers.push(buildLoop(eyeletU(i), side)))
  }
  return mergeBuffers(buffers)
}

const LACE_HALF_W = 0.034
const LACE_HALF_T = 0.0072
const LACE_END_LIFT = 0.017
const LACE_SAG = 0.004

function buildStrand(uA: number, sideA: 1 | -1, uB: number, sideB: 1 | -1): MeshBuffer {
  const vA = loopV(uA, sideA)
  const vB = loopV(uB, sideB)
  const nodes = liftedPath(
    (t) => {
      const arch = Math.sin(Math.PI * t)
      return [
        uA + (uB - uA) * t,
        vA + (vB - vA) * t,
        LACE_END_LIFT - (LACE_END_LIFT - LACE_SAG) * arch,
      ]
    },
    26,
    () => LACE_HALF_W,
    () => LACE_HALF_T,
  )
  return sweepRibbon(nodes, 10, { caps: true, exponent: 5.5 })
}

/** Two tails diving under the collar — laces tucked, no bow to age badly. */
function buildTail(side: 1 | -1): MeshBuffer {
  const uA = eyeletU(0)
  const vA = loopV(uA, side)
  const nodes = liftedPath(
    (t) => [uA - 0.055 * t, vA + (0.5 - vA) * 0.45 * t, LACE_END_LIFT - 0.05 * t * t],
    16,
    () => LACE_HALF_W,
    () => LACE_HALF_T,
  )
  return sweepRibbon(nodes, 10, { caps: true, exponent: 5.5 })
}

export function buildLaces(): MeshBuffer {
  const buffers: MeshBuffer[] = []
  for (let i = 0; i < EYELET_COUNT - 1; i++) {
    buffers.push(buildStrand(eyeletU(i), -1, eyeletU(i + 1), 1))
    buffers.push(buildStrand(eyeletU(i), 1, eyeletU(i + 1), -1))
  }
  buffers.push(buildTail(-1), buildTail(1))
  return mergeBuffers(buffers)
}
