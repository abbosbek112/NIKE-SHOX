import { Matrix4, Vector3, type Object3D } from 'three'

/**
 * Measure a product mesh the same way `bounds.ts` was measured by hand.
 *
 * The procedural shoe's box and hull are constants in `bounds.ts` because they
 * were measured once, off geometry that never changes. A dropped-in GLB has no
 * such luxury: nobody is going to open Blender and transcribe forty-six numbers.
 * So the same measurement runs at load time instead, and the camera's containment
 * fit reads whatever comes out.
 *
 * Everything here is one-shot work on the loading thread. It walks every vertex of
 * every visible mesh, which is why it is written as a flat sweep with no
 * allocation inside the loop rather than as anything clever.
 */

/** Cap on sampled vertices. A 400k-vertex scan does not need every one of them. */
const MAX_SAMPLES = 150_000

/**
 * Cap on hull points, because the camera fit walks them twice per frame. Past
 * this the exact hull is replaced by a support polygon that *contains* it — the
 * error is outwards, which for a fit whose job is to not crop is the safe side.
 */
const MAX_HULL = 160
const SUPPORT_DIRECTIONS = 64

export interface MeasuredExtents {
  min: [number, number, number]
  max: [number, number, number]
  /**
   * Tallest point in the outer eighth of each end of the x range, low end first.
   * A shoe's collar is roughly three times the height of its toe box, so this is
   * what tells the loader which end is the heel.
   */
  endHeight: [number, number]
  triangles: number
  vertices: number
}

export interface Measured extends MeasuredExtents {
  /** Convex footprint on the floor plane, as flat (x, z) pairs. */
  hull: Float32Array
}

const local = new Matrix4()
const inverse = new Matrix4()
const vertex = new Vector3()

interface Sample {
  xs: Float64Array
  zs: Float64Array
  n: number
}

/** Every visible mesh under `root`, in `root`'s own space. */
function sweep(root: Object3D, visit: (x: number, y: number, z: number) => void): { triangles: number; vertices: number } {
  root.updateWorldMatrix(true, true)
  inverse.copy(root.matrixWorld).invert()

  let triangles = 0
  let vertices = 0
  const meshes: { mesh: Object3D; count: number }[] = []

  root.traverse((object) => {
    const mesh = object as Object3D & {
      isMesh?: boolean
      isInstancedMesh?: boolean
      count?: number
      geometry?: { attributes?: { position?: { count: number } }; index?: { count: number } | null }
    }
    if (!mesh.isMesh || !mesh.visible) return
    for (let p = mesh.parent; p; p = p.parent) if (!p.visible) return
    const position = mesh.geometry?.attributes?.position
    if (!position) return
    const instances = mesh.isInstancedMesh ? (mesh.count ?? 1) : 1
    triangles += ((mesh.geometry?.index?.count ?? position.count) / 3) * instances
    vertices += position.count * instances
    meshes.push({ mesh, count: instances })
  })

  // One stride for the whole model, so the sample stays evenly spread across it.
  const stride = Math.max(1, Math.ceil(vertices / MAX_SAMPLES))

  for (const { mesh, count } of meshes) {
    const typed = mesh as Object3D & {
      geometry: { attributes: { position: { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } } }
      instanceMatrix?: { array: ArrayLike<number> }
    }
    const position = typed.geometry.attributes.position
    for (let k = 0; k < count; k++) {
      local.multiplyMatrices(inverse, mesh.matrixWorld)
      if (typed.instanceMatrix) {
        const instance = new Matrix4().fromArray(typed.instanceMatrix.array as number[], k * 16)
        local.multiply(instance)
      }
      for (let i = 0; i < position.count; i += stride) {
        vertex.set(position.getX(i), position.getY(i), position.getZ(i)).applyMatrix4(local)
        visit(vertex.x, vertex.y, vertex.z)
      }
    }
  }

  return { triangles: Math.round(triangles), vertices }
}

/** Monotone chain, counter-clockwise, on the sampled (x, z) footprint. */
function convexHull(sample: Sample): number[] {
  const order = Array.from({ length: sample.n }, (_, i) => i).sort(
    (a, b) => sample.xs[a] - sample.xs[b] || sample.zs[a] - sample.zs[b],
  )
  const cross = (o: number, a: number, b: number) =>
    (sample.xs[a] - sample.xs[o]) * (sample.zs[b] - sample.zs[o]) -
    (sample.zs[a] - sample.zs[o]) * (sample.xs[b] - sample.xs[o])

  const build = (indices: number[]): number[] => {
    const chain: number[] = []
    for (const i of indices) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], i) <= 0) chain.pop()
      chain.push(i)
    }
    return chain
  }

  const lower = build(order)
  const upper = build(order.slice().reverse())
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

/**
 * Circumscribed polygon from support values in `SUPPORT_DIRECTIONS` directions.
 * Used when the exact hull is too big to walk every frame: each edge is a
 * supporting line of the real footprint, so the polygon encloses it.
 */
function supportPolygon(sample: Sample): Float32Array {
  const k = SUPPORT_DIRECTIONS
  const support = new Float64Array(k)
  const cos = new Float64Array(k)
  const sin = new Float64Array(k)
  for (let d = 0; d < k; d++) {
    cos[d] = Math.cos((d / k) * Math.PI * 2)
    sin[d] = Math.sin((d / k) * Math.PI * 2)
    support[d] = -Infinity
  }
  for (let i = 0; i < sample.n; i++) {
    for (let d = 0; d < k; d++) {
      const v = sample.xs[i] * cos[d] + sample.zs[i] * sin[d]
      if (v > support[d]) support[d] = v
    }
  }
  // Intersect each neighbouring pair of supporting lines.
  const out = new Float32Array(k * 2)
  for (let d = 0; d < k; d++) {
    const e = (d + 1) % k
    const det = cos[d] * sin[e] - sin[d] * cos[e]
    out[d * 2] = (support[d] * sin[e] - support[e] * sin[d]) / det
    out[d * 2 + 1] = (support[e] * cos[d] - support[d] * cos[e]) / det
  }
  return out
}

/**
 * Box and end heights, no hull.
 *
 * This is what the alignment pass calls, and it calls it four times — after the
 * up-axis fix, after the long axis is turned onto x, after the scale, after the
 * heel flip. So it sweeps twice with no allocation at all rather than collecting
 * the footprint it does not need. (Two sweeps because the end bands cannot be
 * known until the x range is.)
 */
export function measureExtents(root: Object3D): MeasuredExtents {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]

  const counts = sweep(root, (x, y, z) => {
    if (x < min[0]) min[0] = x
    if (y < min[1]) min[1] = y
    if (z < min[2]) min[2] = z
    if (x > max[0]) max[0] = x
    if (y > max[1]) max[1] = y
    if (z > max[2]) max[2] = z
  })

  if (min[0] === Infinity) throw new Error('measureExtents: no visible geometry')

  const band = (max[0] - min[0]) / 8
  const lo = min[0] + band
  const hi = max[0] - band
  const endHeight: [number, number] = [-Infinity, -Infinity]
  sweep(root, (x, y) => {
    if (x <= lo && y > endHeight[0]) endHeight[0] = y
    if (x >= hi && y > endHeight[1]) endHeight[1] = y
  })

  return { min, max, endHeight, triangles: counts.triangles, vertices: counts.vertices }
}

export function measureProduct(root: Object3D): Measured {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  const xs: number[] = []
  const zs: number[] = []
  const ys: number[] = []

  const counts = sweep(root, (x, y, z) => {
    if (x < min[0]) min[0] = x
    if (y < min[1]) min[1] = y
    if (z < min[2]) min[2] = z
    if (x > max[0]) max[0] = x
    if (y > max[1]) max[1] = y
    if (z > max[2]) max[2] = z
    xs.push(x)
    ys.push(y)
    zs.push(z)
  })

  if (!xs.length) throw new Error('measureProduct: no visible geometry')

  const sample: Sample = { xs: Float64Array.from(xs), zs: Float64Array.from(zs), n: xs.length }
  const indices = convexHull(sample)
  let hull: Float32Array
  if (indices.length > MAX_HULL) {
    hull = supportPolygon(sample)
  } else {
    hull = new Float32Array(indices.length * 2)
    indices.forEach((index, i) => {
      hull[i * 2] = sample.xs[index]
      hull[i * 2 + 1] = sample.zs[index]
    })
  }

  // Height at each end, over the outer eighth of the length.
  const span = max[0] - min[0]
  const band = span / 8
  const endHeight: [number, number] = [-Infinity, -Infinity]
  for (let i = 0; i < sample.n; i++) {
    if (xs[i] <= min[0] + band && ys[i] > endHeight[0]) endHeight[0] = ys[i]
    if (xs[i] >= max[0] - band && ys[i] > endHeight[1]) endHeight[1] = ys[i]
  }

  return { min, max, hull, endHeight, triangles: counts.triangles, vertices: counts.vertices }
}
