import { Matrix4, Vector3 } from 'three'
import { latheProfile, type MeshBuffer, type ProfilePoint } from './builders'
import { centreZ, lastX } from './last'
import { columnSpanAt, columnTrackHalf, lowerPlateTopAt } from './sole'

/**
 * The Shox column array — the reason this shoe exists.
 *
 * One lathed spool is built at unit size and drawn as an InstancedMesh, so the
 * whole array is a single draw call and each column can still be scaled and
 * compressed independently. The profile keeps crisp normals at the flange lips
 * (see `latheProfile`) because a smoothed lip reads as rubber, not moulded PU.
 */

/** Normalised spool: unit max radius, unit height, waisted at mid-span. */
const SPOOL: readonly ProfilePoint[] = [
  { r: 0.0, y: 0.0 },
  { r: 0.8, y: 0.0, sharp: true },
  { r: 1.0, y: 0.05, sharp: true },
  { r: 1.0, y: 0.105, sharp: true },
  { r: 0.9, y: 0.168 },
  { r: 0.752, y: 0.258 },
  { r: 0.648, y: 0.372 },
  { r: 0.612, y: 0.5 },
  { r: 0.648, y: 0.628 },
  { r: 0.752, y: 0.742 },
  { r: 0.9, y: 0.832 },
  { r: 1.0, y: 0.895, sharp: true },
  { r: 1.0, y: 0.95, sharp: true },
  { r: 0.8, y: 1.0, sharp: true },
  { r: 0.0, y: 1.0 },
]

export interface ColumnStation {
  /** Length parameter of the station. */
  u: number
  /** Radius of the flange. */
  radius: number
  /** -1 lateral (outboard), +1 medial (inboard). */
  side: 1 | -1
  /** Centre of the column base in world space. */
  base: Vector3
  /** Vertical room between the plates at this station. */
  span: number
  /** 0 at the toe, 1 at the heel — drives the compression falloff. */
  heelWeight: number
}

const STATION_U: readonly { u: number; radius: number }[] = [
  { u: 0.055, radius: 0.122 },
  { u: 0.2, radius: 0.126 },
  { u: 0.305, radius: 0.08 },
  { u: 0.376, radius: 0.08 },
  { u: 0.448, radius: 0.079 },
  { u: 0.519, radius: 0.079 },
  { u: 0.59, radius: 0.078 },
  { u: 0.661, radius: 0.077 },
  { u: 0.733, radius: 0.075 },
  { u: 0.804, radius: 0.073 },
  { u: 0.875, radius: 0.07 },
]

export const COLUMNS_PER_SIDE = STATION_U.length
export const COLUMN_COUNT = STATION_U.length * 2

/** Lateral offset of a column centre, kept just inside the plate edge. */
function trackZ(u: number, radius: number, side: 1 | -1): number {
  const half = columnTrackHalf(u, side)
  const outer = Math.max(radius * 1.06, half - radius - 0.018)
  return centreZ(u) + side * outer
}

export function columnStations(): ColumnStation[] {
  const out: ColumnStation[] = []
  const sides: (1 | -1)[] = [-1, 1]
  STATION_U.forEach(({ u, radius }) => {
    sides.forEach((side) => {
      out.push({
        u,
        radius,
        side,
        base: new Vector3(lastX(u), lowerPlateTopAt(u), trackZ(u, radius, side)),
        span: Math.max(0.02, columnSpanAt(u)),
        heelWeight: 1 - Math.min(1, Math.max(0, (u - 0.05) / 0.85)),
      })
    })
  })
  return out
}

export function buildColumn(radialSegments = 20): MeshBuffer {
  return latheProfile(SPOOL, radialSegments, false)
}

/** Fraction of column height lost at full compression. */
export const COMPRESS_TRAVEL = 0.18
/** Matching drop and nose-up pitch of everything sitting above the columns. */
export const COMPRESS_DROP = 0.035
export const COMPRESS_PITCH = 0.0061

const _scale = new Vector3()

/**
 * How far each layer travels in an exploded view. The columns split the
 * difference between the grounded outsole and the sprung upper so the array
 * stays visibly *between* the plates rather than drifting off with one of them.
 */
export const EXPLODE_GROUNDED = -0.3
export const EXPLODE_COLUMN = -0.16
export const EXPLODE_SPRUNG = 0.14
/** Lateral spread, so the inner columns are not hidden behind the outer ones. */
export const EXPLODE_SPREAD = 0.075

/**
 * Write the instance matrix for one column.
 * `compress` squashes it; `explode` drops the array away from the plates so the
 * technology chapter can pull the sole apart.
 */
export function columnMatrix(
  station: ColumnStation,
  compress: number,
  explode: number,
  out: Matrix4 = new Matrix4(),
): Matrix4 {
  const squash = 1 - COMPRESS_TRAVEL * compress * (0.55 + 0.45 * station.heelWeight)
  const height = station.span * squash
  _scale.set(station.radius, height, station.radius)
  out.makeScale(_scale.x, _scale.y, _scale.z)
  out.setPosition(
    station.base.x,
    station.base.y + explode * EXPLODE_COLUMN,
    station.base.z + station.side * explode * EXPLODE_SPREAD,
  )
  return out
}
