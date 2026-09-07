import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  type Texture,
} from 'three'

/**
 * Procedural PBR maps.
 *
 * The project ships no image assets: every texture the sneaker uses is drawn on
 * an offscreen canvas at boot. That keeps the payload tiny, keeps the look
 * consistent across colourways, and means there is nothing to 404.
 *
 * All maps here are *data*, not colour, so they stay in `NoColorSpace`.
 */

type Ctx = CanvasRenderingContext2D

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')
  return { canvas, ctx }
}

function finish(canvas: HTMLCanvasElement, repeat: number, anisotropy: number): CanvasTexture {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = NoColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(repeat, repeat)
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.anisotropy = anisotropy
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

/* -------------------------------------------------------------- value noise */

function valueNoise(size: number, cells: number, seed: number): Float32Array {
  const grid = new Float32Array((cells + 1) * (cells + 1))
  for (let i = 0; i < grid.length; i++) {
    const s = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453
    grid[i] = s - Math.floor(s)
  }

  const out = new Float32Array(size * size)
  const step = size / cells
  const fade = (t: number) => t * t * (3 - 2 * t)

  for (let y = 0; y < size; y++) {
    const gy = y / step
    const y0 = Math.floor(gy)
    const ty = fade(gy - y0)
    for (let x = 0; x < size; x++) {
      const gx = x / step
      const x0 = Math.floor(gx)
      const tx = fade(gx - x0)
      const i00 = y0 * (cells + 1) + x0
      const a = grid[i00]
      const b = grid[i00 + 1]
      const c = grid[i00 + cells + 1]
      const d = grid[i00 + cells + 2]
      const top = a + (b - a) * tx
      const bottom = c + (d - c) * tx
      out[y * size + x] = top + (bottom - top) * ty
    }
  }
  return out
}

function fbm(size: number, octaves: number, baseCells: number, seed: number): Float32Array {
  const out = new Float32Array(size * size)
  let amplitude = 1
  let total = 0
  for (let o = 0; o < octaves; o++) {
    const layer = valueNoise(size, baseCells * Math.pow(2, o), seed + o * 17)
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amplitude
    total += amplitude
    amplitude *= 0.5
  }
  for (let i = 0; i < out.length; i++) out[i] /= total
  return out
}

/* ------------------------------------------------- height map → normal map */

function heightToNormal(height: Float32Array, size: number, strength: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size)
  const image = ctx.createImageData(size, size)
  const data = image.data
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Sobel gradients — wrapped, so the map tiles seamlessly.
      const dx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1))
      const dy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1))

      let nx = -dx * strength
      let ny = -dy * strength
      let nz = 1
      const len = Math.hypot(nx, ny, nz) || 1
      nx /= len
      ny /= len
      nz /= len

      const i = (y * size + x) * 4
      data[i] = (nx * 0.5 + 0.5) * 255
      data[i + 1] = (ny * 0.5 + 0.5) * 255
      data[i + 2] = (nz * 0.5 + 0.5) * 255
      data[i + 3] = 255
    }
  }

  ctx.putImageData(image, 0, 0)
  return canvas
}

function greyCanvas(values: Float32Array, size: number, min: number, max: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size)
  const image = ctx.createImageData(size, size)
  const data = image.data
  for (let i = 0; i < values.length; i++) {
    const v = Math.round((min + (max - min) * values[i]) * 255)
    const o = i * 4
    data[o] = v
    data[o + 1] = v
    data[o + 2] = v
    data[o + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/* ----------------------------------------------------------- weave patterns */

/** Plain-weave height field: interlaced yarns plus fibre noise. */
function weaveHeight(size: number, threads: number): Float32Array {
  const out = new Float32Array(size * size)
  const cell = size / threads
  const fibre = fbm(size, 3, Math.max(8, threads * 2), 3.1)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cell)
      const cy = Math.floor(y / cell)
      const fx = (x % cell) / cell
      const fy = (y % cell) / cell
      const warpOver = (cx + cy) % 2 === 0

      // Rounded yarn cross-section: a cosine bump across the yarn's width.
      const across = warpOver ? fy : fx
      const along = warpOver ? fx : fy
      const bump = Math.cos((across - 0.5) * Math.PI) ** 1.6
      // Slight dip where the yarn passes under its neighbour.
      const dip = 0.86 + 0.14 * Math.sin(along * Math.PI)
      out[y * size + x] = Math.min(1, bump * dip * 0.9 + fibre[y * size + x] * 0.16)
    }
  }
  return out
}

/* --------------------------------------------------------------- public API */

export interface TextureSet {
  meshNormal: Texture
  meshRoughness: Texture
  glossRoughness: Texture
  foamRoughness: Texture
  foamNormal: Texture
  rubberNormal: Texture
  rubberRoughness: Texture
  textileNormal: Texture
  dispose: () => void
}

let cache: TextureSet | null = null

export function createTextureSet(anisotropy = 4, detail = 1): TextureSet {
  if (cache) return cache

  const size = detail >= 1 ? 512 : 256
  const smallSize = detail >= 1 ? 256 : 128

  // Engineered mesh: fine plain weave, strong normal, mostly matte.
  const weave = weaveHeight(size, detail >= 1 ? 42 : 26)
  const meshNormal = finish(heightToNormal(weave, size, 3.4), 1, anisotropy)
  const meshRoughness = finish(greyCanvas(weave, size, 0.94, 0.7), 1, anisotropy)

  // Glossy TPU: near-mirror with anisotropic micro-scratches so highlights streak.
  const { canvas: scratchCanvas, ctx: scratchCtx } = makeCanvas(smallSize)
  scratchCtx.fillStyle = '#1c1c1c'
  scratchCtx.fillRect(0, 0, smallSize, smallSize)
  scratchCtx.lineWidth = 1
  for (let i = 0; i < smallSize * 1.6; i++) {
    const y = (i * 37.6) % smallSize
    const shade = 26 + ((i * 53) % 26)
    scratchCtx.strokeStyle = `rgb(${shade},${shade},${shade})`
    scratchCtx.beginPath()
    scratchCtx.moveTo(-4, y)
    scratchCtx.bezierCurveTo(smallSize * 0.3, y + 1.2, smallSize * 0.7, y - 1.2, smallSize + 4, y)
    scratchCtx.stroke()
  }
  const glossRoughness = finish(scratchCanvas, 1, anisotropy)

  // Foam: soft blobby noise, low frequency.
  const foam = fbm(smallSize, 4, 5, 7.7)
  const foamRoughness = finish(greyCanvas(foam, smallSize, 0.58, 0.86), 1, anisotropy)
  const foamNormal = finish(heightToNormal(foam, smallSize, 1.1), 1, anisotropy)

  // Rubber outsole: coarse grain.
  const rubber = fbm(smallSize, 4, 14, 2.3)
  const rubberNormal = finish(heightToNormal(rubber, smallSize, 2.2), 1, anisotropy)
  const rubberRoughness = finish(greyCanvas(rubber, smallSize, 0.5, 0.78), 1, anisotropy)

  // Collar / lace textile: coarser weave than the upper mesh.
  const textile = weaveHeight(smallSize, detail >= 1 ? 18 : 12)
  const textileNormal = finish(heightToNormal(textile, smallSize, 2.6), 1, anisotropy)

  const all = [
    meshNormal,
    meshRoughness,
    glossRoughness,
    foamRoughness,
    foamNormal,
    rubberNormal,
    rubberRoughness,
    textileNormal,
  ]

  cache = {
    meshNormal,
    meshRoughness,
    glossRoughness,
    foamRoughness,
    foamNormal,
    rubberNormal,
    rubberRoughness,
    textileNormal,
    dispose: () => {
      all.forEach((texture) => texture.dispose())
      cache = null
    },
  }
  return cache
}

export function disposeTextureSet(): void {
  cache?.dispose()
}
