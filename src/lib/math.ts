import type { EaseName } from '@/types'

export const clamp = (v: number, min = 0, max = 1): number => (v < min ? min : v > max ? max : v)

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Inverse lerp — where does `v` sit between a and b, clamped to 0..1. */
export const invLerp = (a: number, b: number, v: number): number => (b === a ? 0 : clamp((v - a) / (b - a)))

export const mapRange = (v: number, inMin: number, inMax: number, outMin: number, outMax: number): number =>
  lerp(outMin, outMax, invLerp(inMin, inMax, v))

export const smoothstep = (t: number): number => {
  const x = clamp(t)
  return x * x * (3 - 2 * x)
}

export const smootherstep = (t: number): number => {
  const x = clamp(t)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

/**
 * Frame-rate independent exponential smoothing.
 * `lambda` is roughly "how many e-folds per second" — 4 is soft, 12 is snappy.
 */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  target + (current - target) * Math.exp(-lambda * dt)

export const EASINGS: Record<EaseName, (t: number) => number> = {
  linear: (t) => clamp(t),
  smooth: smoothstep,
  smoother: smootherstep,
  outCubic: (t) => 1 - Math.pow(1 - clamp(t), 3),
  inOutCubic: (t) => {
    const x = clamp(t)
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
  },
  outExpo: (t) => {
    const x = clamp(t)
    return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)
  },
  inOutQuint: (t) => {
    const x = clamp(t)
    return x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2
  },
}

export const applyEase = (name: EaseName | undefined, t: number): number => EASINGS[name ?? 'smooth'](t)

export interface Segment<T> {
  a: T
  b: T
  /** Raw 0..1 position inside the segment. */
  t: number
  /** Eased 0..1 position, using the *destination* keyframe's ease. */
  e: number
}

/**
 * Locate the pair of keyframes surrounding `p` and return the eased blend factor.
 * Keys must be sorted ascending by `progress`. Runs every frame, so it does no
 * allocation beyond the returned record and uses a linear scan (key counts are
 * small — a dozen or so per timeline).
 */
export function segmentAt<T extends { progress: number; ease?: EaseName }>(keys: readonly T[], p: number): Segment<T> {
  const last = keys.length - 1
  if (p <= keys[0].progress) return { a: keys[0], b: keys[0], t: 0, e: 0 }
  if (p >= keys[last].progress) return { a: keys[last], b: keys[last], t: 1, e: 1 }

  let i = 0
  while (i < last && keys[i + 1].progress <= p) i++
  const a = keys[i]
  const b = keys[i + 1]
  const t = invLerp(a.progress, b.progress, p)
  return { a, b, t, e: applyEase(b.ease, t) }
}

/** Lerp two 3-tuples into a mutable target array. Avoids allocating in the render loop. */
export function lerpVec3(
  out: [number, number, number],
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  out[0] = a[0] + (b[0] - a[0]) * t
  out[1] = a[1] + (b[1] - a[1]) * t
  out[2] = a[2] + (b[2] - a[2]) * t
  return out
}

/** Shortest-path angle lerp, in radians. */
export function lerpAngle(a: number, b: number, t: number): number {
  const TAU = Math.PI * 2
  let d = ((b - a) % TAU + TAU * 1.5) % TAU - Math.PI
  return a + d * t
}

export const degToRad = (d: number): number => (d * Math.PI) / 180

/** Deterministic pseudo-random in 0..1 — used for procedural geometry jitter. */
export function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453123
  return s - Math.floor(s)
}
