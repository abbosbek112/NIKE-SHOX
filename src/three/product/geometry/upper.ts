import { Vector3 } from 'three'
import {
  buildSurfaceGrid,
  mergeBuffers,
  ribbonOnSurface,
  sweepRibbon,
  type MeshBuffer,
  type SurfaceFn,
} from './builders'
import { isInsideOpening, lastPoint, lastSurface, soleTopAt, spline1d, throatHalf } from './last'
import { buildSlab } from './sole'

/**
 * Everything above the sole: the upper shell, its lining, the moulded TPU
 * panels, the rib cage, the collar, the tongue and the side mark.
 *
 * Two techniques do all the work here:
 *
 * 1. **Applique panels.** A panel is a patch of the last surface pushed out
 *    along its own normal, with the lift fading to almost nothing at the patch
 *    boundary. Because the edge melts back into the body there is no seam to
 *    hide and no open rim to cap — which is also how a real heat-pressed TPU
 *    counter behaves. `EDGE_LIFT` keeps a fraction of a millimetre so the
 *    coplanar boundary can still win the depth test.
 *
 * 2. **Surface ribbons.** Ribs, piping, collar and laces are swept sections
 *    following paths drawn *on* the last, so they hug the body exactly and all
 *    catch light as one family.
 */

/** Minimum lift of an applique edge — enough to beat z-fighting, invisible. */
const EDGE_LIFT = 0.0016

const smoothstep = (x: number): number => x * x * (3 - 2 * x)

/** 0 at the ends of [0,1], 1 across the middle, ramping over `w`. */
function fade(t: number, w: number): number {
  if (w <= 0) return 1
  const a = Math.min(1, Math.max(0, t / w))
  const b = Math.min(1, Math.max(0, (1 - t) / w))
  return smoothstep(a) * smoothstep(b)
}

export interface PanelSpec {
  uRange: readonly [number, number]
  /** v boundary at this u. Must increase with t; values may leave [0,1]. */
  vAt: (u: number) => readonly [number, number]
  /** Peak lift above the body. */
  lift: number
  uCount: number
  vCount: number
  /** Ramp widths for the lift fade, in patch parameter space. */
  uFade?: readonly [number, number]
  vFade?: number
  uvScale?: readonly [number, number]
}

/** (s, t) -> a point on the last, with s and t spanning the patch. */
function panelSurface(spec: PanelSpec): SurfaceFn {
  const [u0, u1] = spec.uRange
  return (s, t, out) => {
    const u = u0 + (u1 - u0) * s
    const [v0, v1] = spec.vAt(u)
    return lastPoint(u, v0 + (v1 - v0) * t, out)
  }
}

/** An applique panel: a lifted patch of the body whose edge melts back in. */
export function buildPanel(spec: PanelSpec): MeshBuffer {
  const [fs, fe] = spec.uFade ?? [0.18, 0.18]
  const vf = spec.vFade ?? 0.14
  const [su, sv] = spec.uvScale ?? [2, 2]
  return buildSurfaceGrid(panelSurface(spec), spec.uCount, spec.vCount, {
    offset: (s, t) => {
      const su2 = Math.min(smoothstep(Math.min(1, s / Math.max(fs, 1e-4))), smoothstep(Math.min(1, (1 - s) / Math.max(fe, 1e-4))))
      return EDGE_LIFT + spec.lift * su2 * fade(t, vf)
    },
    uv: (s, t) => [s * su, t * sv],
  })
}

/* ------------------------------------------------------------------- shell */

/** Wall thickness of the upper — sets how deep the collar reads. */
const WALL = 0.015

/**
 * The visible upper: the whole last tube with the ankle-and-throat quads
 * removed. The lower third of the tube is buried inside the sole stack, so it
 * costs a few thousand triangles and in exchange the body is closed at the heel
 * and toe with no seam work at all.
 */
export function buildShell(uCount: number, vCount: number): MeshBuffer {
  return buildSurfaceGrid(lastSurface, uCount, vCount, {
    skip: isInsideOpening,
    capStart: true,
    capEnd: true,
    uv: (u, v) => [u * 4.2, v * 2.6],
  })
}

/** Lining: the same tube pulled inward, so looking into the collar shows depth. */
export function buildLining(uCount: number, vCount: number): MeshBuffer {
  return buildSurfaceGrid(lastSurface, uCount, vCount, {
    uRange: [0.055, 0.69],
    offset: -WALL,
    flip: true,
    skip: isInsideOpening,
    uv: (u, v) => [u * 4.2, v * 2.6],
  })
}

/** Footbed. Sits just above the sole top so the opening never shows daylight. */
export function buildInsole(uCount: number, vCount: number): MeshBuffer {
  return buildSlab(
    {
      yLow: (u) => soleTopAt(u) - 0.014,
      yHigh: (u) => soleTopAt(u) + 0.009,
      flare: -0.055,
      exponent: 3,
      uRange: [0.045, 0.945],
    },
    uCount,
    vCount,
  )
}

/* ------------------------------------------------------------- TPU panels */

/**
 * Half-width of the uncovered strip along the rear centreline, in v. Real
 * counters are moulded in two halves with a spine down the middle; leaving a
 * couple of millimetres open reproduces that and avoids a degenerate patch
 * seam at the heel tip.
 */
const CLIP_GAP = spline1d([
  [0.0, 0.045],
  [0.05, 0.056],
  [0.1, 0.1],
  [0.16, 0.175],
  [0.205, 0.235],
  [0.245, 0.275],
])

/** Sculpted glossy heel counter, wrapping the rear quarter. */
export function buildHeelClip(uCount: number, vCount: number): MeshBuffer {
  return buildPanel({
    uRange: [0, 0.245],
    vAt: (u) => {
      const g = CLIP_GAP(u)
      return [g - 0.5, 0.5 - g]
    },
    lift: 0.011,
    uCount,
    vCount,
    uFade: [0.05, 0.42],
    vFade: 0.1,
    uvScale: [1.4, 2.2],
  })
}

const BUMPER_GAP = spline1d([
  [0.845, 0.315],
  [0.9, 0.24],
  [0.95, 0.14],
  [1.0, 0.055],
])

/** Glossy toe bumper over the front of the toe box. */
export function buildToeBumper(uCount: number, vCount: number): MeshBuffer {
  return buildPanel({
    uRange: [0.845, 1.0],
    vAt: (u) => {
      const g = BUMPER_GAP(u)
      return [g - 0.5, 0.5 - g]
    },
    lift: 0.01,
    uCount,
    vCount,
    uFade: [0.4, 0.05],
    vFade: 0.1,
    uvScale: [1.1, 2.0],
  })
}

/* -------------------------------------------------------- the sole seam line */

const _probe = new Vector3()

/**
 * The `v` at which the body crosses a given height, found by bisection.
 * `lastPoint` is monotone in y over v ∈ [0, 0.25], which is what makes this
 * safe. Used to lay the piping exactly on the line where the upper emerges
 * from the midsole, so the join is covered however the last is retuned.
 */
export function heightV(u: number, side: 1 | -1, targetY: number): number {
  let lo = 0
  let hi = 0.25
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2
    const y = lastPoint(u, side < 0 ? mid : 1 - mid, _probe).y
    if (y < targetY) lo = mid
    else hi = mid
  }
  const v = (lo + hi) / 2
  return side < 0 ? v : 1 - v
}

/** Glossy piping along the upper/midsole junction, on both sides. */
export function buildPiping(segments: number): MeshBuffer {
  const sides: (1 | -1)[] = [-1, 1]
  return mergeBuffers(
    sides.map((side) => {
      const nodes = ribbonOnSurface(
        lastSurface,
        (t) => {
          const u = 0.03 + t * 0.94
          return [u, heightV(u, side, soleTopAt(u) + 0.004)]
        },
        segments,
        (t) => 0.0135 * (0.55 + 0.45 * fade(t, 0.06)),
        (t) => 0.0075 * (0.4 + 0.6 * fade(t, 0.05)),
        0.0012,
      )
      return sweepRibbon(nodes, 10, { caps: true, exponent: 3.4 })
    }),
  )
}

/* ---------------------------------------------------------------- rib cage */

export const RIBS_PER_SIDE = 11

/** Where a rib tops out: just outside the lacing opening, never inside it. */
function ribHeadV(u: number): number {
  return 0.5 - Math.max(throatHalf(u) + 0.032, 0.062)
}

/**
 * The signature rib cage: glossy TPU strips fanning up from the midsole over
 * the matte mesh base, raked further rearward toward the toe. Each rib is a
 * lens-shaped ribbon that tapers to nothing at both ends so it melts into the
 * upper instead of stopping at a hard edge.
 */
export function buildRibs(segments: number): MeshBuffer {
  const buffers: MeshBuffer[] = []
  const sides: (1 | -1)[] = [-1, 1]
  for (let i = 0; i < RIBS_PER_SIDE; i++) {
    const k = i / (RIBS_PER_SIDE - 1)
    const uFoot = 0.285 + k * 0.565
    const uHead = uFoot - (0.028 + 0.055 * k)
    const scale = 1 - 0.18 * k
    sides.forEach((side) => {
      const vFoot = heightV(uFoot, side, soleTopAt(uFoot) + 0.028)
      const vHead = side < 0 ? ribHeadV(uHead) : 1 - ribHeadV(uHead)
      const nodes = ribbonOnSurface(
        lastSurface,
        (t) => {
          const e = smoothstep(t)
          return [uFoot + (uHead - uFoot) * e, vFoot + (vHead - vFoot) * t]
        },
        segments,
        (t) => (0.031 - 0.012 * t) * scale * fade(t, 0.11),
        (t) => 0.0068 * scale * fade(t, 0.16),
        0.0014,
      )
      buffers.push(sweepRibbon(nodes, 10, { caps: false, exponent: 4.2 }))
    })
  }
  return mergeBuffers(buffers)
}

/* ----------------------------------------------------------------- collar */

/** Padding profile of the rim: fat at the ankle, slim where the lacing ends. */
const COLLAR_W = spline1d([
  [0.07, 0.013],
  [0.11, 0.031],
  [0.18, 0.035],
  [0.26, 0.029],
  [0.36, 0.021],
  [0.48, 0.017],
  [0.6, 0.013],
  [0.66, 0.01],
])

const COLLAR_T = spline1d([
  [0.07, 0.011],
  [0.12, 0.026],
  [0.19, 0.028],
  [0.28, 0.022],
  [0.4, 0.014],
  [0.52, 0.011],
  [0.66, 0.008],
])

const COLLAR_U0 = 0.072
const COLLAR_U1 = 0.646

/** t runs the closed rim loop: medial edge forward, then lateral edge back. */
const collarU = (t: number): number =>
  t <= 0.5
    ? COLLAR_U0 + (COLLAR_U1 - COLLAR_U0) * (t / 0.5)
    : COLLAR_U1 - (COLLAR_U1 - COLLAR_U0) * ((t - 0.5) / 0.5)

/**
 * One continuous rolled rim around the whole opening — collar padding at the
 * ankle flowing into the eyestay reinforcement at the front, which is how the
 * real thing is built and avoids two ribbons fighting over the same edge.
 */
export function buildCollar(segments: number): MeshBuffer {
  const nodes = ribbonOnSurface(
    lastSurface,
    (t) => {
      const u = collarU(t)
      return [u, t <= 0.5 ? 0.5 + throatHalf(u) : 0.5 - throatHalf(u)]
    },
    segments,
    (t) => COLLAR_W(collarU(t)),
    (t) => COLLAR_T(collarU(t)),
    -0.01,
  )
  return sweepRibbon(nodes, 12, { caps: true, exponent: 2.6 })
}

/* ----------------------------------------------------------------- tongue */

const TONGUE_U: readonly [number, number] = [0.235, 0.662]

/**
 * A padded tongue filling the throat: two surfaces that meet at the perimeter,
 * so it is a closed lens with a free rear edge you can actually see into the
 * collar past.
 */
export function buildTongue(uCount: number, vCount: number): MeshBuffer {
  const spec: PanelSpec = {
    uRange: TONGUE_U,
    vAt: (u) => {
      const h = throatHalf(u) * 0.99
      return [0.5 - h, 0.5 + h]
    },
    lift: 0,
    uCount,
    vCount,
  }
  const surface = panelSurface(spec)
  const top = (s: number, t: number) =>
    -0.009 - 0.03 * (1 - fade(t, 0.24)) - 0.05 * (1 - smoothstep(Math.min(1, s / 0.16)))
  const gap = (s: number, t: number) => 0.026 * fade(s, 0.15) * fade(t, 0.1)
  const uv = (s: number, t: number): [number, number] => [s * 2.4, t * 1.1]
  return mergeBuffers([
    buildSurfaceGrid(surface, uCount, vCount, { offset: top, uv }),
    buildSurfaceGrid(surface, uCount, vCount, {
      offset: (s, t) => top(s, t) - gap(s, t),
      flip: true,
      uv,
    }),
  ])
}

/* ------------------------------------------------------------------- mark */

/**
 * The side mark: a swoosh laid on the flank as a moulded overlay.
 *
 * Drawn as a patch of the last between two edge curves rather than as a swept
 * ribbon, because a swoosh is not a stroke of constant weight — it is a broad,
 * angled terminal at the heel end drawn out into a long point at the toe, and
 * only an outline can say that. `s` runs 0 at the terminal to 1 at the point;
 * `MARK_LOWER`/`MARK_UPPER` are its two edges in `v`.
 *
 * The band was fitted to the body it sits on: its foot stays clear of the piping
 * along the midsole seam and its crest stays below the lacing opening and the
 * collar at every station. It is lifted clear of the rib crests and ends in a cut
 * edge rather than a fade, so the mark reads as a single piece laid *over* the rib
 * cage rather than woven between the ribs.
 */

/** Length span of the mark: heel-side terminal to the tip of the point. */
const MARK_U: readonly [number, number] = [0.3, 0.88]

/**
 * The mark's baseline in `v` — the height its lowest point would sit at, tracked
 * a few millimetres above the piping along the midsole seam so the shape follows
 * the shoe's own line as the flank falls away toward the toe.
 */
const MARK_BASE = spline1d([
  [0.0, 0.1765],
  [0.2, 0.1935],
  [0.4, 0.2065],
  [0.6, 0.2215],
  [0.8, 0.238],
  [1.0, 0.252],
])

/** Height of the mark above its baseline, in `v`. */
const MARK_HEIGHT = 0.152

/**
 * The two edges, in units of `MARK_HEIGHT`. Read them together: the terminal at
 * s = 0 is the full height tall, the lower edge falls away to its lowest point
 * around s = 0.46 and then climbs to meet the upper edge at the point, and the
 * width between them shrinks the whole way — two thirds of the height at the
 * terminal, a tenth of it with 15% of the length still to run. That asymmetry —
 * one broad angled end, one long drawn-out point, a single dip between them — is
 * the shape; a stroke of even weight is not.
 */
const MARK_LOWER = spline1d([
  [0.0, 0.34],
  [0.08, 0.205],
  [0.18, 0.1],
  [0.28, 0.038],
  [0.38, 0.006],
  [0.46, 0.0],
  [0.56, 0.018],
  [0.66, 0.058],
  [0.76, 0.112],
  [0.85, 0.17],
  [0.93, 0.225],
  [1.0, 0.268],
])

const MARK_UPPER = spline1d([
  [0.0, 1.0],
  [0.08, 0.82],
  [0.18, 0.63],
  [0.28, 0.492],
  [0.38, 0.398],
  [0.46, 0.348],
  [0.56, 0.305],
  [0.66, 0.28],
  [0.76, 0.268],
  [0.85, 0.263],
  [0.93, 0.262],
  [1.0, 0.268],
])

/** Forward lean of the terminal cut, so the top corner leads the bottom one. */
const markSlant = (s: number): number => 0.034 * (1 - smoothstep(Math.min(1, s / 0.25)))

/**
 * Height of the overlay above the body. A rib's crest stands `lift + 2·halfThick`
 * proud — `ribbonOnSurface` already pushes the ribbon's centre line out by its own
 * half-thickness — so anything meant to read as laid *over* the rib cage has to
 * clear 0.015, not the 0.007 a glance at `buildRibs` suggests.
 */
const MARK_LIFT = 0.022


function markSurface(side: 1 | -1): SurfaceFn {
  return (s, t, out) => {
    const base = MARK_BASE(s)
    const lo = base + MARK_HEIGHT * MARK_LOWER(s)
    const hi = base + MARK_HEIGHT * MARK_UPPER(s)
    const v = lo + (hi - lo) * t
    const u = MARK_U[0] + (MARK_U[1] - MARK_U[0]) * s + t * markSlant(s)
    return lastPoint(u, side < 0 ? v : 1 - v, out)
  }
}

export function buildMark(segments: number): MeshBuffer {
  const sCount = Math.max(18, segments)
  const tCount = Math.max(8, Math.round(segments * 0.34))
  // One grid division at each boundary is spent on a near-vertical wall, so the
  // overlay ends in a cut edge that stays clear of the rib crests it rides over.
  // A smooth fade to the body — the trick every other applique here uses — cannot
  // work for the mark: it would sink the band below rib height along its whole
  // perimeter and let the ribs surface through the shape.
  const ws = 1.0001 / sCount
  const wt = 1.0001 / tCount
  const wall = (x: number, w: number) => Math.min(1, Math.max(0, x / w))
  const sides: (1 | -1)[] = [-1, 1]
  return mergeBuffers(
    sides.map((side) =>
      buildSurfaceGrid(markSurface(side), sCount, tCount, {
        flip: side > 0,
        offset: (s, t) =>
          EDGE_LIFT + MARK_LIFT * Math.min(wall(s, ws), wall(1 - s, ws), wall(t, wt), wall(1 - t, wt)),
        uv: (s, t) => [s * 2.4, t * 1.1],
      }),
    ),
  )
}

