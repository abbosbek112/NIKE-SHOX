import { BufferAttribute, BufferGeometry, Vector3 } from 'three'

/**
 * Low-level geometry construction helpers.
 *
 * Everything the sneaker is made of is generated from four primitives defined
 * here — a surface grid, a swept ribbon, a lathe with split-normal control, and
 * a thin-shell surface patch. Building on a small, well-understood set keeps
 * every part of the shoe sitting exactly on the same body.
 */

export interface MeshBuffer {
  positions: number[]
  normals: number[]
  uvs: number[]
  indices: number[]
}

export const createBuffer = (): MeshBuffer => ({ positions: [], normals: [], uvs: [], indices: [] })

export function pushVertex(buf: MeshBuffer, p: Vector3, n: Vector3, u: number, v: number): number {
  const index = buf.positions.length / 3
  buf.positions.push(p.x, p.y, p.z)
  buf.normals.push(n.x, n.y, n.z)
  buf.uvs.push(u, v)
  return index
}

export function pushTri(buf: MeshBuffer, a: number, b: number, c: number): void {
  buf.indices.push(a, b, c)
}

/** Quad given in counter-clockwise order when viewed from outside. */
export function pushQuad(buf: MeshBuffer, a: number, b: number, c: number, d: number): void {
  buf.indices.push(a, b, d, b, c, d)
}

export function appendBuffer(target: MeshBuffer, source: MeshBuffer): void {
  const offset = target.positions.length / 3
  for (let i = 0; i < source.positions.length; i++) target.positions.push(source.positions[i])
  for (let i = 0; i < source.normals.length; i++) target.normals.push(source.normals[i])
  for (let i = 0; i < source.uvs.length; i++) target.uvs.push(source.uvs[i])
  for (let i = 0; i < source.indices.length; i++) target.indices.push(source.indices[i] + offset)
}

export function mergeBuffers(buffers: MeshBuffer[]): MeshBuffer {
  const out = createBuffer()
  buffers.forEach((buf) => appendBuffer(out, buf))
  return out
}

export function toGeometry(buf: MeshBuffer, recomputeNormals = false): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(buf.positions), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(buf.normals), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(buf.uvs), 2))
  geometry.setIndex(buf.indices)
  if (recomputeNormals) geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  geometry.computeBoundingBox()
  return geometry
}

export const triangleCount = (buf: MeshBuffer): number => buf.indices.length / 3

/* ------------------------------------------------------------------ surface */

/** A parametric surface: writes the point for (u, v) into `out` and returns it. */
export type SurfaceFn = (u: number, v: number, out: Vector3) => Vector3

const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()
const _du = new Vector3()
const _dv = new Vector3()

export interface SurfaceFrame {
  position: Vector3
  normal: Vector3
  /** Unit tangent along increasing u. */
  tangentU: Vector3
  /** Unit tangent along increasing v. */
  tangentV: Vector3
}

/**
 * Sample a surface and derive an orthonormal-ish frame by central differences.
 * `flip` reverses the normal when the parameterisation winds the other way.
 */
export function surfaceFrame(fn: SurfaceFn, u: number, v: number, eps = 0.0025, flip = false): SurfaceFrame {
  const position = fn(u, v, new Vector3())
  fn(Math.min(1, u + eps), v, _a)
  fn(Math.max(0, u - eps), v, _b)
  _du.subVectors(_a, _b)
  fn(u, Math.min(1, v + eps), _a)
  fn(u, Math.max(0, v - eps), _c)
  _dv.subVectors(_a, _c)

  const tangentU = _du.clone().normalize()
  const tangentV = _dv.clone().normalize()
  const normal = new Vector3().crossVectors(tangentV, tangentU).normalize()
  if (flip) normal.negate()
  if (!Number.isFinite(normal.x) || normal.lengthSq() < 0.5) normal.set(0, 1, 0)
  return { position, normal, tangentU, tangentV }
}

export interface SurfaceGridOptions {
  uRange?: readonly [number, number]
  vRange?: readonly [number, number]
  /** Outward displacement along the surface normal. */
  offset?: number | ((u: number, v: number) => number)
  /** Return true to omit the quad whose centre falls here. */
  skip?: (u: number, v: number) => boolean
  /** Reverse winding + normals (used for interior shells). */
  flip?: boolean
  /** Remap the emitted UVs. Defaults to (u, v). */
  uv?: (u: number, v: number) => [number, number]
  /** Close a v-wrapped ring at u = uRange[0] with a triangle fan. */
  capStart?: boolean
  /** Close a v-wrapped ring at u = uRange[1] with a triangle fan. */
  capEnd?: boolean
}

/** Tessellate a parametric surface into a quad grid. */
export function buildSurfaceGrid(
  fn: SurfaceFn,
  uCount: number,
  vCount: number,
  options: SurfaceGridOptions = {},
): MeshBuffer {
  const { uRange = [0, 1], vRange = [0, 1], offset = 0, skip, flip = false, uv, capStart, capEnd } = options
  const buf = createBuffer()
  const uAt = (i: number) => uRange[0] + ((uRange[1] - uRange[0]) * i) / uCount
  const vAt = (j: number) => vRange[0] + ((vRange[1] - vRange[0]) * j) / vCount
  const offsetAt = typeof offset === 'function' ? offset : () => offset
  const grid: number[] = []

  for (let i = 0; i <= uCount; i++) {
    const u = uAt(i)
    for (let j = 0; j <= vCount; j++) {
      const v = vAt(j)
      const frame = surfaceFrame(fn, u, v, 0.0025, flip)
      const d = offsetAt(u, v)
      if (d !== 0) frame.position.addScaledVector(frame.normal, d)
      const [tu, tv] = uv ? uv(u, v) : [u, v]
      grid[i * (vCount + 1) + j] = pushVertex(buf, frame.position, frame.normal, tu, tv)
    }
  }

  for (let i = 0; i < uCount; i++) {
    for (let j = 0; j < vCount; j++) {
      if (skip && skip(uAt(i + 0.5), vAt(j + 0.5))) continue
      const a = grid[i * (vCount + 1) + j]
      const b = grid[(i + 1) * (vCount + 1) + j]
      const c = grid[(i + 1) * (vCount + 1) + j + 1]
      const d = grid[i * (vCount + 1) + j + 1]
      // Winding must agree with surfaceFrame's normal = tangentV × tangentU.
      if (flip) pushQuad(buf, a, b, c, d)
      else pushQuad(buf, a, d, c, b)
    }
  }

  // Ends of a v-wrapped loft: fan the ring to its own centroid so the body is
  // closed at the heel and toe tips without a bespoke cap mesh.
  const fanRing = (i: number, dir: number) => {
    const centroid = new Vector3()
    let count = 0
    for (let j = 0; j < vCount; j++) {
      const idx = grid[i * (vCount + 1) + j] * 3
      centroid.x += buf.positions[idx]
      centroid.y += buf.positions[idx + 1]
      centroid.z += buf.positions[idx + 2]
      count++
    }
    if (!count) return
    centroid.divideScalar(count)
    const axis = surfaceFrame(fn, uAt(i), vAt(Math.floor(vCount / 4))).tangentU.clone().multiplyScalar(dir)
    const hub = pushVertex(buf, centroid, axis, 0.5, 0.5)
    for (let j = 0; j < vCount; j++) {
      const a = grid[i * (vCount + 1) + j]
      const b = grid[i * (vCount + 1) + ((j + 1) % vCount)]
      const forward = dir > 0 ? !flip : flip
      if (forward) pushTri(buf, hub, a, b)
      else pushTri(buf, hub, b, a)
    }
  }
  if (capStart) fanRing(0, -1)
  if (capEnd) fanRing(uCount, 1)

  return buf
}

/* ------------------------------------------------------------------- ribbon */

export interface RibbonNode {
  position: Vector3
  /** Surface normal — the ribbon's thin axis. */
  normal: Vector3
  /** Direction of travel — the sweep axis. */
  tangent: Vector3
  halfWidth: number
  halfThick: number
}

const _bi = new Vector3()
const _no = new Vector3()
const _pt = new Vector3()

/**
 * Sweep a rounded-rectangle cross-section along a path.
 *
 * `exponent` shapes the section: 2 is an ellipse, 4–6 reads as a rounded
 * rectangle. Ribs, laces, piping and the collar are all this one primitive with
 * different widths — which is why they all catch light as one family.
 */
export function sweepRibbon(
  nodes: readonly RibbonNode[],
  radial = 10,
  options: { caps?: boolean; exponent?: number } = {},
): MeshBuffer {
  const { caps = true, exponent = 4.5 } = options
  const buf = createBuffer()
  if (nodes.length < 2) return buf
  const p = 2 / exponent
  const rings: number[][] = []
  const total = nodes.length - 1

  nodes.forEach((node, i) => {
    _no.copy(node.normal).normalize()
    _bi.crossVectors(node.tangent, _no).normalize()
    if (_bi.lengthSq() < 0.5) _bi.set(0, 0, 1)
    const ring: number[] = []
    for (let k = 0; k < radial; k++) {
      const theta = (k / radial) * Math.PI * 2
      const cs = Math.cos(theta)
      const sn = Math.sin(theta)
      const fw = Math.sign(cs) * Math.pow(Math.abs(cs), p)
      const fn = Math.sign(sn) * Math.pow(Math.abs(sn), p)
      _pt.copy(node.position).addScaledVector(_bi, fw * node.halfWidth).addScaledVector(_no, fn * node.halfThick)
      // Gradient of |x/a|^n + |y/b|^n = 1, mapped back into world space.
      const q = exponent - 1
      const nx = (Math.sign(fw) * Math.pow(Math.abs(fw), q)) / Math.max(node.halfWidth, 1e-4)
      const ny = (Math.sign(fn) * Math.pow(Math.abs(fn), q)) / Math.max(node.halfThick, 1e-4)
      const normal = new Vector3().addScaledVector(_bi, nx).addScaledVector(_no, ny).normalize()
      ring.push(pushVertex(buf, _pt, normal, i / total, k / radial))
    }
    rings.push(ring)
  })

  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const k2 = (k + 1) % radial
      pushQuad(buf, rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2])
    }
  }

  if (caps) {
    const capAt = (index: number, dir: number) => {
      const node = nodes[index]
      const n = node.tangent.clone().multiplyScalar(dir).normalize()
      const centre = pushVertex(buf, node.position, n, 0.5, 0.5)
      const ring = rings[index]
      for (let k = 0; k < radial; k++) {
        const k2 = (k + 1) % radial
        if (dir > 0) pushTri(buf, centre, ring[k2], ring[k])
        else pushTri(buf, centre, ring[k], ring[k2])
      }
    }
    capAt(nodes.length - 1, 1)
    capAt(0, -1)
  }

  return buf
}

/**
 * Lay a ribbon along a path drawn *on* a surface, so it hugs the body exactly.
 * Widths and thicknesses are given as functions of the normalised path
 * position, which is how ribs taper to a point at both ends.
 */
export function ribbonOnSurface(
  fn: SurfaceFn,
  path: (t: number) => [number, number],
  segments: number,
  halfWidth: (t: number) => number,
  halfThick: (t: number) => number,
  lift = 0,
): RibbonNode[] {
  const frames: SurfaceFrame[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const [u, v] = path(t)
    frames.push(surfaceFrame(fn, u, v))
  }
  return frames.map((frame, i) => {
    const t = i / segments
    const prev = frames[Math.max(0, i - 1)]
    const next = frames[Math.min(frames.length - 1, i + 1)]
    const tangent = new Vector3().subVectors(next.position, prev.position).normalize()
    if (tangent.lengthSq() < 0.5) tangent.copy(frame.tangentU)
    const position = frame.position.clone().addScaledVector(frame.normal, lift + halfThick(t))
    return { position, normal: frame.normal.clone(), tangent, halfWidth: halfWidth(t), halfThick: halfThick(t) }
  })
}

/* -------------------------------------------------------------------- lathe */

export interface ProfilePoint {
  r: number
  y: number
  /** Duplicate the ring so the crease stays crisp instead of smearing. */
  sharp?: boolean
}

/**
 * Revolve a profile around the Y axis with explicit crease control.
 *
 * three's own LatheGeometry smooths every vertex, which turns the Shox spool's
 * flange lips into soft blobs. Splitting normals at `sharp` points is what makes
 * the columns read as moulded polyurethane.
 */
export function latheProfile(profile: readonly ProfilePoint[], radial = 20, caps = true): MeshBuffer {
  const buf = createBuffer()
  if (profile.length < 2) return buf
  const rings: Array<{ r: number; y: number; nr: number; ny: number; v: number }> = []
  const segNormals: Array<[number, number]> = []

  for (let i = 0; i < profile.length - 1; i++) {
    const dr = profile[i + 1].r - profile[i].r
    const dy = profile[i + 1].y - profile[i].y
    const len = Math.hypot(dr, dy) || 1
    segNormals.push([dy / len, -dr / len])
  }

  // Arc-length parameterisation keeps the roughness map from stretching.
  const arc: number[] = [0]
  for (let i = 0; i < profile.length - 1; i++) {
    arc.push(arc[i] + Math.hypot(profile[i + 1].r - profile[i].r, profile[i + 1].y - profile[i].y))
  }
  const arcTotal = arc[arc.length - 1] || 1

  profile.forEach((pt, i) => {
    const before = segNormals[i - 1]
    const after = segNormals[i]
    const v = arc[i] / arcTotal
    if (pt.sharp && before && after) {
      rings.push({ r: pt.r, y: pt.y, nr: before[0], ny: before[1], v })
      rings.push({ r: pt.r, y: pt.y, nr: after[0], ny: after[1], v })
    } else {
      const a = before ?? after ?? [1, 0]
      const b = after ?? before ?? [1, 0]
      const nr = (a[0] + b[0]) / 2
      const ny = (a[1] + b[1]) / 2
      const len = Math.hypot(nr, ny) || 1
      rings.push({ r: pt.r, y: pt.y, nr: nr / len, ny: ny / len, v })
    }
  })

  const p = new Vector3()
  const n = new Vector3()
  const rows = rings.map((ring) => {
    const row: number[] = []
    for (let k = 0; k <= radial; k++) {
      const theta = (k / radial) * Math.PI * 2
      const cs = Math.cos(theta)
      const sn = Math.sin(theta)
      p.set(ring.r * cs, ring.y, ring.r * sn)
      n.set(ring.nr * cs, ring.ny, ring.nr * sn).normalize()
      row.push(pushVertex(buf, p, n, k / radial, ring.v))
    }
    return row
  })

  for (let i = 0; i < rows.length - 1; i++) {
    if (rings[i].y === rings[i + 1].y && rings[i].r === rings[i + 1].r) continue
    for (let k = 0; k < radial; k++) {
      pushQuad(buf, rows[i][k], rows[i + 1][k], rows[i + 1][k + 1], rows[i][k + 1])
    }
  }

  if (caps) {
    const disc = (ring: (typeof rings)[number], row: number[], dir: number) => {
      if (ring.r <= 1e-5) return
      const centre = pushVertex(buf, p.set(0, ring.y, 0), n.set(0, dir, 0), 0.5, 0.5)
      for (let k = 0; k < radial; k++) {
        if (dir > 0) pushTri(buf, centre, row[k], row[k + 1])
        else pushTri(buf, centre, row[k + 1], row[k])
      }
    }
    disc(rings[0], rows[0], -1)
    disc(rings[rings.length - 1], rows[rows.length - 1], 1)
  }

  return buf
}
