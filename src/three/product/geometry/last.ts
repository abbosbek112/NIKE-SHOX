import { Vector3 } from 'three'

/**
 * The last: one analytic body that every part of the shoe is derived from.
 *
 * The shoe is a closed lofted tube — a foot volume — parameterised by
 * `u` along the length (0 = heel tip, 1 = toe tip) and `v` around the
 * cross-section (0 = sole seam, 0.25 = lateral, 0.5 = top, 0.75 = medial).
 * The lower part of the tube is buried inside the sole assembly, exactly like a
 * real last inside a real shoe, so the body closes without any seam work.
 *
 * Because upper, ribs, heel clip, collar, laces and mark are all evaluated from
 * this one function, nothing can float off the surface or sink into it.
 *
 * Units: 1 = 10 cm. Overall length 2.62 ≈ a EU 42 sole.
 * Axes: +x toe, +y up, -z lateral (outside of a right shoe), +z medial.
 */

export const SHOE_LENGTH = 2.62
export const HEEL_X = -SHOE_LENGTH / 2
export const TOE_X = SHOE_LENGTH / 2

/* ----------------------------------------------------- monotone cubic spline */

interface Spline {
  (x: number): number
}

/**
 * PCHIP interpolation. Catmull-Rom overshoots — on a shoe last that shows up as
 * a pinch at the ball and a negative width at the toe, so monotone it is.
 */
export function spline1d(points: readonly (readonly [number, number])[]): Spline {
  const n = points.length
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const h: number[] = []
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i])
    d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]))
  }
  const m: number[] = new Array(n)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) {
      m[i] = 0
    } else {
      const w1 = 2 * h[i] + h[i - 1]
      const w2 = h[i] + 2 * h[i - 1]
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    }
  }

  return (x: number) => {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[n - 1]) return ys[n - 1]
    let i = 0
    while (i < n - 2 && x > xs[i + 1]) i++
    const t = (x - xs[i]) / h[i]
    const t2 = t * t
    const t3 = t2 * t
    return (
      ys[i] * (2 * t3 - 3 * t2 + 1) +
      m[i] * h[i] * (t3 - 2 * t2 + t) +
      ys[i + 1] * (-2 * t3 + 3 * t2) +
      m[i + 1] * h[i] * (t3 - t2)
    )
  }
}

/* -------------------------------------------------------------------- tables */

/** Widest half-width of the body at each station (before side asymmetry). */
const HALF_WIDTH = spline1d([
  [0.0, 0.038],
  [0.03, 0.162],
  [0.07, 0.256],
  [0.12, 0.303],
  [0.17, 0.322],
  [0.22, 0.321],
  [0.28, 0.309],
  [0.34, 0.296],
  [0.4, 0.29],
  [0.46, 0.3],
  [0.52, 0.318],
  [0.58, 0.342],
  [0.64, 0.367],
  [0.7, 0.385],
  [0.75, 0.392],
  [0.8, 0.388],
  [0.85, 0.371],
  [0.89, 0.345],
  [0.93, 0.301],
  [0.96, 0.254],
  [0.98, 0.19],
  [0.995, 0.088],
  [1.0, 0.026],
])

/** Top of the sole assembly — the visible upper starts here. */
const SOLE_TOP = spline1d([
  [0.0, 0.404],
  [0.06, 0.396],
  [0.15, 0.379],
  [0.25, 0.356],
  [0.35, 0.331],
  [0.45, 0.309],
  [0.55, 0.293],
  [0.65, 0.284],
  [0.72, 0.283],
  [0.8, 0.292],
  [0.87, 0.313],
  [0.93, 0.349],
  [0.975, 0.393],
  [1.0, 0.424],
])

/** Silhouette top line — collar rim at the ankle, instep further forward. */
const UPPER_TOP = spline1d([
  [0.0, 0.556],
  [0.03, 0.662],
  [0.07, 0.792],
  [0.11, 0.889],
  [0.16, 0.932],
  [0.21, 0.936],
  [0.27, 0.911],
  [0.33, 0.861],
  [0.4, 0.799],
  [0.47, 0.741],
  [0.55, 0.685],
  [0.63, 0.633],
  [0.71, 0.585],
  [0.79, 0.543],
  [0.86, 0.507],
  [0.92, 0.477],
  [0.96, 0.457],
  [0.985, 0.44],
  [1.0, 0.431],
])

/** Asymmetry: a right last is straighter outside and fuller through the arch. */
const LAT_SCALE = spline1d([
  [0.0, 1.0],
  [0.2, 1.0],
  [0.34, 0.962],
  [0.44, 0.963],
  [0.56, 0.99],
  [0.7, 1.016],
  [0.85, 1.01],
  [1.0, 1.0],
])

const MED_SCALE = spline1d([
  [0.0, 1.0],
  [0.2, 1.012],
  [0.34, 1.052],
  [0.44, 1.056],
  [0.56, 1.028],
  [0.7, 1.004],
  [0.85, 0.984],
  [1.0, 1.0],
])

/** Centreline drift — the toe swings gently inboard. */
const Z_MID = spline1d([
  [0.0, 0.0],
  [0.3, 0.008],
  [0.55, 0.018],
  [0.8, 0.032],
  [1.0, 0.046],
])

/** Superellipse exponents. Higher is boxier; the footbed side is the flattest. */
const N_SIDE = spline1d([
  [0.0, 2.3],
  [0.2, 2.45],
  [0.45, 2.6],
  [0.72, 2.78],
  [0.9, 2.55],
  [1.0, 2.35],
])

const N_UP = spline1d([
  [0.0, 2.35],
  [0.2, 2.5],
  [0.5, 2.62],
  [0.75, 2.72],
  [1.0, 2.45],
])

const N_DOWN = spline1d([
  [0.0, 3.1],
  [0.25, 3.5],
  [0.55, 3.9],
  [0.78, 4.0],
  [1.0, 3.1],
])

/** Height of the widest line, as a fraction of the body's total height. */
const WAIST_FRAC = spline1d([
  [0.0, 0.44],
  [0.22, 0.4],
  [0.5, 0.37],
  [0.75, 0.36],
  [1.0, 0.46],
])

/** How far the body is buried inside the sole. */
const BURY = 0.055

/**
 * Half-width, in `v`, of the ankle-and-throat opening. Zero means the body is
 * closed at that station. Peaks at the ankle, tapers out where the lacing ends.
 */
const THROAT = spline1d([
  [0.07, 0.0],
  [0.09, 0.056],
  [0.12, 0.104],
  [0.16, 0.144],
  [0.21, 0.16],
  [0.27, 0.15],
  [0.34, 0.128],
  [0.42, 0.102],
  [0.5, 0.08],
  [0.57, 0.057],
  [0.625, 0.03],
  [0.65, 0.0],
])

export const throatHalf = (u: number): number => (u <= 0.07 || u >= 0.65 ? 0 : Math.max(0, THROAT(u)))

export const isInsideOpening = (u: number, v: number): boolean => {
  const half = throatHalf(u)
  return half > 0 && Math.abs(v - 0.5) < half
}

/* ------------------------------------------------------------ the last body */

export const lastX = (u: number): number => HEEL_X + u * SHOE_LENGTH
export const soleTopAt = (u: number): number => SOLE_TOP(u)
export const upperTopAt = (u: number): number => UPPER_TOP(u)
export const halfWidthAt = (u: number): number => Math.max(0, HALF_WIDTH(u))
export const lateralHalfWidth = (u: number): number => halfWidthAt(u) * LAT_SCALE(u)
export const medialHalfWidth = (u: number): number => halfWidthAt(u) * MED_SCALE(u)
export const centreZ = (u: number): number => Z_MID(u)

export interface Section {
  x: number
  zMid: number
  yBottom: number
  yWaist: number
  yTop: number
  hzLat: number
  hzMed: number
  nSide: number
  nUp: number
  nDown: number
}

export function sectionAt(u: number): Section {
  const top = UPPER_TOP(u)
  const bottom = SOLE_TOP(u) - BURY
  const waist = bottom + (top - bottom) * WAIST_FRAC(u)
  const w = halfWidthAt(u)
  return {
    x: lastX(u),
    zMid: Z_MID(u),
    yBottom: bottom,
    yWaist: waist,
    yTop: top,
    hzLat: w * LAT_SCALE(u),
    hzMed: w * MED_SCALE(u),
    nSide: N_SIDE(u),
    nUp: N_UP(u),
    nDown: N_DOWN(u),
  }
}

const signedPow = (t: number, e: number): number => Math.sign(t) * Math.pow(Math.abs(t), e)

/**
 * The body surface. `v` runs the closed section: 0 sole seam → 0.25 lateral →
 * 0.5 top → 0.75 medial → 1 back to the seam.
 */
export function lastPoint(u: number, v: number, out: Vector3 = new Vector3()): Vector3 {
  const s = sectionAt(u)
  const phi = v * Math.PI * 2 - Math.PI / 2
  const sn = Math.sin(phi)
  const cs = Math.cos(phi)
  const up = sn >= 0
  const sy = signedPow(sn, 2 / (up ? s.nUp : s.nDown))
  const sz = signedPow(cs, 2 / s.nSide)
  const y = s.yWaist + sy * (up ? s.yTop - s.yWaist : s.yWaist - s.yBottom)
  const z = s.zMid - sz * (cs >= 0 ? s.hzLat : s.hzMed)
  return out.set(s.x, y, z)
}

/** Convenience: the surface function in the shape the builders expect. */
export const lastSurface = lastPoint
