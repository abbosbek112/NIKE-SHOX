import type { MaterialZone } from '@/types'

/**
 * How a dropped-in GLB is interpreted.
 *
 * The project ships no 3D asset: `ProceduralShoe` is real geometry built in code,
 * and it is what renders unless a file appears at `MODEL.url`. When one does, this
 * file is the whole contract — the loader normalises the model against these
 * numbers rather than asking anyone to re-measure `bounds.ts` by hand.
 *
 * The defaults are written for a shoe exported from any of the usual sources
 * (photogrammetry app, AI image-to-3D, marketplace GLB) with no preparation at
 * all: arbitrary scale, arbitrary yaw, floating above or below its own origin.
 * Everything below is an escape hatch for the cases the automatic pass gets wrong.
 */

export interface ModelConfig {
  /** Site-relative URL. Absent file ⇒ the procedural shoe, silently. */
  url: string
  /**
   * Up axis in the source file. glTF is Y-up by specification, but exporters out
   * of Z-up tools sometimes bake the wrong basis into the root node instead of
   * the vertices, and the result loads on its side.
   */
  upAxis: 'y' | 'z'
  /** Yaw applied after auto-alignment, in radians. For a model that lands mirrored. */
  yaw: number
  /**
   * Which end of the aligned x range the heel sits on. `auto` reads the height
   * profile: a shoe's collar stands roughly three times as tall as its toe box,
   * so the taller end is the heel. Override if a high-top or a boot fools it.
   */
  heel: 'auto' | 'low-x' | 'high-x'
  /**
   * Length along x after normalisation, in world units. Matches the procedural
   * shoe's 2.623 so every camera keyframe, light position and framing shift in
   * the timeline keeps its authored meaning.
   */
  length: number
  /** Lift off the floor plane, as a fraction of length. Non-zero only for a scan with a dirty base. */
  lift: number
  /**
   * Keep the file's own materials instead of the zone materials below.
   *
   * Off by default, and it costs the colour chapter: the colourway crossfade
   * animates material properties, so a model wearing its own baked textures will
   * not change finish. Worth turning on only to look at a raw scan as it came out
   * of the scanner.
   */
  useSourceMaterials: boolean
}

export const MODEL: ModelConfig = {
  url: '/models/shox.glb',
  upAxis: 'y',
  yaw: 0,
  heel: 'auto',
  length: 2.623,
  lift: 0,
  useSourceMaterials: false,
}

/**
 * Mesh/material name → material zone, most specific first.
 *
 * `ShoeMaterials` keys everything by zone, so this table is what lets a real
 * model inherit the colourway crossfade instead of arriving with whatever
 * baked textures its exporter produced. Names are matched case-insensitively as
 * substrings, against the mesh name first and then its material's name, so
 * `Heel_Counter_TPU_01` lands on `heelClip` and not on `tpuRib`.
 *
 * Order matters and the first hit wins. Anything unmatched falls back to
 * `meshBase`, which is the upper — the largest zone, and the one whose finish is
 * least wrong for an unknown part.
 */
export const ZONE_KEYWORDS: readonly (readonly [MaterialZone, readonly string[]])[] = [
  ['column', ['column', 'shox', 'spring', 'piston', 'cylinder', 'pillar']],
  ['outsole', ['outsole', 'tread', 'rubber', 'bottom', 'grip']],
  ['plate', ['plate', 'shank', 'carrier', 'bridge']],
  ['chassis', ['chassis', 'midsole', 'foam', 'wedge', 'cage']],
  ['heelClip', ['heelclip', 'heel_clip', 'counter', 'heelcup', 'heel']],
  ['toeBumper', ['toebumper', 'toe_bumper', 'toecap', 'toe_cap', 'mudguard', 'toe']],
  ['collar', ['collar', 'ankle', 'cuff', 'padding', 'lining']],
  ['tongue', ['tongue', 'label', 'flap']],
  ['lace', ['lace', 'shoelace', 'string', 'aglet']],
  ['eyestay', ['eyestay', 'eyelet', 'eyerow', 'lacestay', 'quarter']],
  ['tpuRib', ['tpurib', 'tpu', 'rib', 'support', 'overlay', 'panel', 'wing']],
  ['mark', ['mark', 'swoosh', 'logo', 'branding', 'emblem', 'badge']],
  ['trim', ['trim', 'stitch', 'seam', 'piping', 'edge', 'welt']],
  ['meshBase', ['upper', 'mesh', 'knit', 'weave', 'textile', 'fabric', 'body', 'vamp']],
]

/**
 * Node names the teardown and compression chapters drive, if the model has them.
 *
 * A scan or a generated mesh is one welded shell and will match none of these —
 * `apply` then no-ops, the sole does not split, and every other chapter still
 * reads correctly. A model authored with separable parts gets the full
 * choreography for free by naming its groups.
 */
export const PART_NAMES = {
  /** Everything the columns carry: upper, chassis, laces. Rises on `explode`. */
  sprung: ['sprung', 'upper', 'shoe-sprung', 'body'],
  /** Outsole and lower plate. Drops on `explode`. */
  grounded: ['grounded', 'outsole', 'shoe-grounded', 'sole'],
  /** The column array itself, if it is a group of siblings or an instanced mesh. */
  columns: ['columns', 'shox-columns', 'shox'],
} as const
