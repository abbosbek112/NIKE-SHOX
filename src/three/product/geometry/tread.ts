import { Vector3 } from 'three'
import {
  buildSurfaceGrid,
  createBuffer,
  mergeBuffers,
  pushTri,
  pushVertex,
  type MeshBuffer,
  type SurfaceFn,
} from './builders'
import { columnStations } from './columns'
import { HEEL_X, SHOE_LENGTH, centreZ, lastX } from './last'
import {
  outsoleBottomAt,
  outsoleHalfZ,
  outsoleShellBottomY,
  outsoleTopAt,
  soleBottomAt,
} from './sole'

/**
 * The rubber tread — the lugs on the underside of the shoe.
 *
 * `sole.ts` lifts the outsole shell's own underside by `TREAD_T`, leaving a
 * recessed floor; the lugs built here fill that space back down to the ground
 * line. Every lug's bottom face is `soleBottomAt` — the exact curve the
 * featureless slab used to end on — so the contact line, the stack height and
 * therefore `productBounds` are all unchanged. Nothing above the outsole had to
 * move, and the shoe can neither hover nor sink into the floor.
 *
 * A lug is a closed superellipse prism: a bevelled contact face on the ground line,
 * a side wall with a moulding draft, and a top disc pushed up *inside* the shell so
 * the two never show a seam. Its wall is built from `buildSurfaceGrid` rather than a
 * bespoke primitive — `theta = -b · 2π` makes the section's natural normal face
 * outward, which is the same winding convention the sole slabs are lofted on, and
 * `capEnd` closes the buried top into a watertight solid.
 *
 * The layout is derived from the column array rather than tabulated, so the tread
 * keeps its grooves and its clearances if the array is ever retuned: a pod under
 * every column, a crash pad bridging the two heel pods, a transverse bar across
 * the centre at each forefoot station, a wrap over the toe spring — and nothing
 * down the middle of the midfoot, so the raised shell reads as a shank channel.
 */

/** How far a lug pushes up into the shell. */
const OVERLAP = 0.004

/** Keep-out from the outsole's plan outline. At this distance a lug reads flush. */
const EDGE_INSET = 0.008

/** Groove between a centre bar and the pods under the columns. */
const CHANNEL_GAP = 0.026

/** Groove between two lugs along the length of the shoe. */
const GROOVE = 0.024

/** Plan size of a pod, as a multiple of its column's flange radius. */
const POD_HALF_Z = 1.25
const POD_HALF_LEN = 0.92

/** Stations from here forward get a centre bar as well as their two pods. */
const FOREFOOT_FROM = 0.56

/** Where the toe wrap stops, before the sole curls away from the ground. */
const TOE_TIP = 0.972

/** The footprint narrows this much between the ground and the shell. */
const DRAFT = 0.12

/** Plan inset at the contact face, so a lug's ground rim reads as a moulded bevel. */
const BEVEL = 0.005
/** Fraction of a lug's height the bevel occupies — one grid row of four. */
const BEVEL_A = 0.25

const TWO_PI = Math.PI * 2

/** Texture repeats per world unit on a lug's bottom face. */
const UV_SCALE = 1.22

interface Lug {
  /** Length span along the last. */
  uRange: readonly [number, number]
  /** Footprint edges at a station, as offsets from the sole's centre line. */
  band: (u: number) => readonly [number, number]
  /** Plan corner sharpness: 2 is an ellipse, 4 and up a rounded rectangle. */
  exponent?: number
}

/** Widest a footprint may reach without breaking through the sole's own edge. */
function edgeLimit(u: number, side: 1 | -1): number {
  const half = outsoleHalfZ(u, side)
  return Math.max(0.004, half - Math.min(EDGE_INSET, half * 0.35))
}

/**
 * Crop a footprint to the sole's plan outline. Near the tips the outline is
 * narrower than a pod, so the band is clamped rather than allowed to invert —
 * which turns those pods into crescents that hug the edge instead of overhanging
 * it.
 */
function crop(u: number, lo: number, hi: number): readonly [number, number] {
  const min = -edgeLimit(u, -1)
  const max = edgeLimit(u, 1)
  const a = Math.max(lo, min)
  const b = Math.min(hi, max)
  const floor = Math.min(0.012, (max - min) * 0.8)
  if (b - a >= floor) return [a, b]
  const c = Math.min(Math.max((a + b) / 2, min + floor / 2), max - floor / 2)
  return [c - floor / 2, c + floor / 2]
}

/**
 * (a, b) -> a point on the lug, with `a` running from the ground up into the
 * shell and `b` around the plan outline.
 */
function lugSurface(lug: Lug): SurfaceFn {
  const [u0, u1] = lug.uRange
  const uMid = (u0 + u1) / 2
  const uHalf = (u1 - u0) / 2
  const p = 2 / (lug.exponent ?? 3.6)
  return (a, b, out) => {
    const theta = -b * TWO_PI
    const cs = Math.cos(theta)
    const sn = Math.sin(theta)
    const k = 1 - DRAFT * a
    // A bevel around the contact face: the plan is pulled in by a fixed world
    // amount at the ground and reaches full size one row up, which gives every lug
    // a 45-degree moulded edge instead of a knife rim.
    const bevel = BEVEL * (1 - Math.min(1, a / BEVEL_A))
    const halfU = Math.max(0.0005, uHalf * k - bevel / SHOE_LENGTH)
    const u = Math.min(1, Math.max(0, uMid + halfU * Math.sign(cs) * Math.pow(Math.abs(cs), p)))
    const [lo, hi] = lug.band(u)
    const halfZ = Math.max(0.0015, ((hi - lo) / 2) * k - bevel)
    const z = centreZ(u) + (lo + hi) / 2 + halfZ * Math.sign(sn) * Math.pow(Math.abs(sn), p)
    const low = soleBottomAt(u)
    // The shell's mid-line is inside the section at every width, so clamping to
    // it guarantees the top disc stays buried however the sole is retuned.
    const mid = (outsoleBottomAt(u) + outsoleTopAt(u)) / 2
    const high = Math.min(outsoleShellBottomY(u, z) + OVERLAP, mid)
    return out.set(lastX(u), low + (high - low) * a, z)
  }
}

/** Ground-line slope at a station, as an outward (downward) unit normal. */
function groundNormal(u: number, out: Vector3): Vector3 {
  const eps = 0.003
  const u0 = Math.max(0, u - eps)
  const u1 = Math.min(1, u + eps)
  const dx = (u1 - u0) * SHOE_LENGTH
  const dy = soleBottomAt(u1) - soleBottomAt(u0)
  return out.set(dx > 0 ? dy / dx : 0, -1, 0).normalize()
}

/**
 * A lug's bottom face — the part that actually touches the ground — as a flat fan.
 *
 * `buildSurfaceGrid`'s own `capStart` would blend the rim's outward normals into
 * the hub's downward one, which lights every lug like an inflated pillow. Building
 * the disc here instead duplicates the rim vertices carrying the ground line's true
 * normal, so the contact face reads flat and its rim reads as a hard moulded edge.
 */
function lugSole(surface: SurfaceFn, vCount: number): MeshBuffer {
  const buf = createBuffer()
  const normal = new Vector3()
  const centroid = new Vector3()
  const ring: Vector3[] = []
  for (let j = 0; j < vCount; j++) {
    const point = surface(0, j / vCount, new Vector3())
    ring.push(point)
    centroid.add(point)
  }
  centroid.divideScalar(vCount)
  const emit = (point: Vector3): number =>
    pushVertex(
      buf,
      point,
      groundNormal((point.x - HEEL_X) / SHOE_LENGTH, normal),
      point.x * UV_SCALE,
      point.z * UV_SCALE,
    )
  const hub = emit(centroid)
  const rim = ring.map(emit)
  // Outward is -y here, so the fan winds hub -> k+1 -> k, as `fanRing` does.
  for (let j = 0; j < vCount; j++) pushTri(buf, hub, rim[(j + 1) % vCount], rim[j])
  return buf
}

interface Station {
  u: number
  radius: number
  side: 1 | -1
  /** Offset of the column's centre from the sole's centre line. */
  dz: number
}
function treadStations(): Station[] {
  return columnStations().map((station) => ({
    u: station.u,
    radius: station.radius,
    side: station.side,
    dz: station.base.z - centreZ(station.u),
  }))
}

/** Half-length of the pod under a column, in `u`. */
const podHalfU = (radius: number): number => (radius * POD_HALF_LEN) / SHOE_LENGTH

/** One pod directly under each column, cropped to the sole's outline. */
function columnPods(stations: readonly Station[]): Lug[] {
  return stations.map((station) => {
    const halfZ = station.radius * POD_HALF_Z
    const halfU = podHalfU(station.radius)
    return {
      uRange: [Math.max(0, station.u - halfU), Math.min(1, station.u + halfU)],
      band: (u) => crop(u, station.dz - halfZ, station.dz + halfZ),
      exponent: 3.6,
    }
  })
}

/**
 * Inner edge of the pods on one side, interpolated between stations. Centre
 * features measure their groove against this rather than against a tabulated
 * width, so the channel survives a change to the column array.
 */
function innerEdgeFn(stations: readonly Station[], side: 1 | -1): (u: number) => number {
  const track = stations
    .filter((station) => station.side === side)
    .map((station) => ({
      u: station.u,
      edge: Math.abs(station.dz) - station.radius * POD_HALF_Z,
    }))
    .sort((a, b) => a.u - b.u)
  return (u) => {
    if (u <= track[0].u) return track[0].edge
    for (let i = 1; i < track.length; i++) {
      if (u > track[i].u) continue
      const t = (u - track[i - 1].u) / (track[i].u - track[i - 1].u)
      return track[i - 1].edge + (track[i].edge - track[i - 1].edge) * t
    }
    return track[track.length - 1].edge
  }
}

/** Full width of the sole at a station — used by the pads that span it. */
const fullBand = (u: number): readonly [number, number] => crop(u, -Infinity, Infinity)

/** A transverse bar across the centre channel, clear of the pods either side. */
function centreBars(stations: readonly Station[]): Lug[] {
  const lateral = innerEdgeFn(stations, -1)
  const medial = innerEdgeFn(stations, 1)
  const band = (u: number): readonly [number, number] =>
    crop(u, -Math.max(0.012, lateral(u) - CHANNEL_GAP), Math.max(0.012, medial(u) - CHANNEL_GAP))
  return stations
    .filter((station) => station.side === -1 && station.u >= FOREFOOT_FROM)
    .map((station) => {
      const halfU = podHalfU(station.radius)
      return { uRange: [station.u - halfU, station.u + halfU], band, exponent: 5 }
    })
}

/** Station rows, heel first, deduplicated across the two sides. */
function rows(stations: readonly Station[]): Station[] {
  const seen = new Set<number>()
  return stations
    .filter((station) => {
      if (seen.has(station.u)) return false
      seen.add(station.u)
      return true
    })
    .sort((a, b) => a.u - b.u)
}

/**
 * The heel crash pad. The two rear columns are far enough apart to leave a 15 mm
 * hole in the tread, which is exactly where a heel lands, so it gets a full-width
 * bar with a groove either side.
 */
function heelBar(stations: readonly Station[]): Lug[] {
  const row = rows(stations)
  if (row.length < 2) return []
  const gap = GROOVE / SHOE_LENGTH
  const start = row[0].u + podHalfU(row[0].radius) + gap
  const end = row[1].u - podHalfU(row[1].radius) - gap
  if (end - start < 0.01) return []
  return [{ uRange: [start, end], band: fullBand, exponent: 6 }]
}

/** The toe-off wrap, past the last column, climbing the toe spring. */
function toeWrap(stations: readonly Station[]): Lug[] {
  const row = rows(stations)
  const last = row[row.length - 1]
  const start = last.u + podHalfU(last.radius) + GROOVE / SHOE_LENGTH
  if (TOE_TIP - start < 0.01) return []
  return [{ uRange: [start, TOE_TIP], band: fullBand, exponent: 6 }]
}

/** Every lug on the shoe, as one buffer, ready to merge into the outsole zone. */
export function buildTread(detail: number): MeshBuffer {
  const vCount = Math.max(12, Math.round(24 * detail))
  const stations = treadStations()
  const lugs = [
    ...columnPods(stations),
    ...heelBar(stations),
    ...centreBars(stations),
    ...toeWrap(stations),
  ]
  return mergeBuffers(
    lugs.flatMap((lug) => {
      const surface = lugSurface(lug)
      return [
        buildSurfaceGrid(surface, 4, vCount, {
          capEnd: true,
          uv: (a, b) => [b * 1.6, a * 0.5],
        }),
        lugSole(surface, vCount),
      ]
    }),
  )
}
