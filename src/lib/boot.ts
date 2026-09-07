import { DEFAULT_COLORWAY, colorwayById } from '@/config/product'
import { ShoeMaterials } from '@/three/materials/materials'
import { buildShoe } from '@/three/product/geometry'
import type { ColorwayId, PerfProfile } from '@/types'

/**
 * The loading sequence.
 *
 * The progress number is real. Each step below is work that genuinely has to
 * finish before the first frame can be composed, and the weights are roughly
 * proportional to how long each one takes on a mid-range laptop. Nothing here is
 * a timer pretending to be a download — the project ships no 3D assets at all,
 * so what the loader is actually waiting for is procedural generation: fourteen
 * zones of PBR texture drawn on a canvas, then ~75k triangles tessellated, then
 * the shader permutations compiled.
 *
 * Each step yields to the event loop first so the loader can repaint between
 * them. Without that the whole sequence would run inside one long task and the
 * bar would jump from 0 to 100 with a frozen page in between.
 */

export interface BootResult {
  materials: ShoeMaterials
  triangles: number
}

/** Weights sum to the share of the bar that runs before the canvas mounts. */
const W_FONTS = 0.12
const W_TEXTURES = 0.34
const W_GEOMETRY = 0.32
/** The remaining 0.22 belongs to shader compilation and the first frame. */
export const PRE_CANVAS_PROGRESS = W_FONTS + W_TEXTURES + W_GEOMETRY

/**
 * Yield long enough for a paint. A double rAF is the reliable way to be *after*
 * the next frame's style/layout/paint rather than merely scheduled for it.
 */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

/**
 * Wait for the display faces so the hero's oversized headline does not reflow
 * a beat after the reveal. Capped: a font that is slow to arrive should delay
 * the experience by a moment, not hold it hostage.
 */
async function waitForFonts(timeout = 2500): Promise<void> {
  if (!('fonts' in document)) return
  await Promise.race([document.fonts.ready, new Promise<void>((resolve) => window.setTimeout(resolve, timeout))])
}

export async function boot(
  profile: PerfProfile,
  colorway: ColorwayId = DEFAULT_COLORWAY,
  onProgress: (value: number) => void = () => {},
): Promise<BootResult> {
  let done = 0
  const advance = (weight: number) => {
    done += weight
    onProgress(done)
  }

  await waitForFonts()
  advance(W_FONTS)
  await nextPaint()

  // Textures first: `ShoeMaterials` needs them, and they are the single
  // heaviest step on a low-tier device.
  const materials = new ShoeMaterials(colorwayById(colorway), {
    anisotropy: profile.tier === 'high' ? 8 : 4,
    detail: profile.geometryDetail,
    simple: profile.tier === 'low',
  })
  advance(W_TEXTURES)
  await nextPaint()

  const geometry = buildShoe(profile.geometryDetail)
  advance(W_GEOMETRY)
  await nextPaint()

  return { materials, triangles: geometry.triangles }
}
