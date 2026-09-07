import type { BufferGeometry } from 'three'
import type { MaterialZone } from '@/types'
import { mergeBuffers, toGeometry, triangleCount, type MeshBuffer } from './builders'
import { buildSole } from './sole'
import { buildColumn, columnStations, type ColumnStation } from './columns'
import {
  buildCollar,
  buildHeelClip,
  buildInsole,
  buildLining,
  buildMark,
  buildPiping,
  buildRibs,
  buildShell,
  buildToeBumper,
  buildTongue,
} from './upper'
import { buildLaces, buildWebbing } from './laces'
import { buildTread } from './tread'

/**
 * Assemble the whole shoe, grouped by material zone.
 *
 * One geometry per zone means one draw call per material — around eighteen for
 * the entire sneaker, with the twenty-two Shox columns collapsed into a single
 * instanced spool. `detail` scales every tessellation count together so the
 * mobile profile can halve the triangle budget without changing the silhouette.
 */

export interface ShoeGeometry {
  zones: Record<MaterialZone, BufferGeometry>
  /**
   * Lower Shox plate. Shares the `plate` material but is rendered separately:
   * it stays planted on the outsole while the columns compress and everything
   * above them travels down.
   */
  lowerPlate: BufferGeometry
  /** Stations for the instanced column array, in the same order as instances. */
  stations: ColumnStation[]
  triangles: number
  dispose(): void
}

let cache: { detail: number; geometry: ShoeGeometry } | null = null

/**
 * Build — or reuse — the whole sneaker at a given tessellation level.
 *
 * The cache exists for the loading sequence rather than for render performance:
 * tessellating 75k triangles takes long enough to notice, and doing it while the
 * canvas mounts would freeze the progress bar at whatever number it last painted.
 * The loader calls this during boot, so `ProceduralShoe`'s `useMemo` gets the
 * finished geometry for free. `dispose()` drops the cache entry, so nothing can
 * ever be handed a geometry whose buffers are already gone.
 */
export function buildShoe(detail = 1): ShoeGeometry {
  const key = Math.round(detail * 100) / 100
  if (cache && cache.detail === key) return cache.geometry

  const res = (n: number) => Math.max(4, Math.round(n * detail))
  const sole = buildSole(detail)

  const parts: Record<MaterialZone, MeshBuffer> = {
    meshBase: buildShell(res(104), res(64)),
    tpuRib: buildRibs(res(22)),
    heelClip: buildHeelClip(res(30), res(52)),
    toeBumper: buildToeBumper(res(18), res(46)),
    collar: mergeBuffers([
      buildCollar(res(140)),
      buildLining(res(40), res(44)),
      buildInsole(res(56), res(24)),
    ]),
    tongue: buildTongue(res(26), res(20)),
    lace: buildLaces(),
    eyestay: buildWebbing(),
    trim: buildPiping(res(110)),
    mark: buildMark(res(34)),
    chassis: sole.chassis,
    plate: sole.upperPlate,
    column: buildColumn(Math.max(10, res(20))),
    outsole: mergeBuffers([sole.outsole, buildTread(detail)]),
  }

  let triangles = triangleCount(sole.lowerPlate)
  const zones = {} as Record<MaterialZone, BufferGeometry>
  const keys = Object.keys(parts) as MaterialZone[]
  keys.forEach((key) => {
    const buffer = parts[key]
    triangles += triangleCount(buffer)
    zones[key] = toGeometry(buffer)
  })
  const lowerPlate = toGeometry(sole.lowerPlate)

  const geometry: ShoeGeometry = {
    zones,
    lowerPlate,
    stations: columnStations(),
    triangles,
    dispose: () => {
      if (cache?.geometry === geometry) cache = null
      keys.forEach((key) => zones[key].dispose())
      lowerPlate.dispose()
    },
  }

  cache = { detail: key, geometry }
  return geometry
}

export {
  COLUMN_COUNT,
  COLUMNS_PER_SIDE,
  columnMatrix,
  COMPRESS_DROP,
  COMPRESS_PITCH,
  COMPRESS_TRAVEL,
  EXPLODE_COLUMN,
  EXPLODE_GROUNDED,
  EXPLODE_SPREAD,
  EXPLODE_SPRUNG,
} from './columns'
export type { ColumnStation } from './columns'
export { platePoint } from './sole'
export { lastPoint, SHOE_LENGTH, upperTopAt } from './last'
