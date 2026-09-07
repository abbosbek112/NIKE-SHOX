/**
 * Export the procedural sneaker to `public/models/nike-shox.glb`.
 *
 *   npm run export:model
 *
 * The site does not need this file in order to run: with nothing at `MODEL.url`,
 * `ProceduralShoe` builds the same geometry in the browser. What the export buys is
 * an asset that exists outside the code — openable in Blender or any glTF viewer,
 * inspectable from every angle, and the thing `src/three/product/loadModel.ts` was
 * written to consume. Regenerating it after a change under
 * `src/three/product/geometry/` is this one command.
 *
 * The scene graph is authored against `src/config/model.ts` rather than for
 * tidiness. Every name below is chosen to land on a `ZONE_KEYWORDS` entry and, where
 * it should, on a `PART_NAMES` bucket — so the loaded file inherits the colourway
 * crossfade and the teardown chapter with no per-model configuration at all.
 */
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

/**
 * three's `GLTFExporter` is a browser module: it merges its buffers through a `Blob`
 * and reads them back with `FileReader`, which Node has no equivalent of. Node does
 * have `Blob`, so this is the entire gap — and shimming it keeps the export a plain
 * npm script instead of something that has to be run in a tab and downloaded.
 */
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      // `onloadend` is assigned *after* this call returns, so the callback has to
      // land on a later microtask. `Blob.arrayBuffer()` already guarantees that.
      blob.arrayBuffer().then(
        (buffer) => {
          this.result = buffer
          this.onloadend?.()
        },
        (error) => {
          this.error = error
          this.onerror?.(error)
        },
      )
    }
  }
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public/models/nike-shox.glb')

/**
 * Mesh name per material zone.
 *
 * `zoneFor` in the loader strips separators and case, then takes the *first*
 * `ZONE_KEYWORDS` entry whose keyword appears anywhere in the name — so these are
 * load-bearing strings, not labels. Two traps worth naming: `plate-lower` must not
 * contain `sole`, which would claim it for the outsole zone, and no node may contain
 * `shox` unless it really is the column array, because `PART_NAMES.columns` matches
 * on that substring and would hand the whole shoe to the compression chapter.
 */
const MESH_NAMES = {
  meshBase: 'upper-mesh',
  tpuRib: 'tpu-rib-overlay',
  heelClip: 'heel-clip',
  toeBumper: 'toe-bumper',
  collar: 'collar-padding',
  tongue: 'tongue',
  lace: 'lace',
  eyestay: 'eyestay-webbing',
  trim: 'trim-piping',
  mark: 'swoosh-mark',
  chassis: 'chassis-midsole',
  plate: 'plate-upper',
  outsole: 'outsole-tread',
  column: 'shox-column-array',
}

/** Material names, so the file also reads correctly opened by hand. */
const MATERIAL_NAMES = {
  meshBase: 'Upper Engineered Mesh',
  tpuRib: 'TPU Rib Overlay',
  heelClip: 'Heel Clip',
  toeBumper: 'Toe Bumper',
  collar: 'Collar Padding',
  tongue: 'Tongue',
  lace: 'Lace',
  eyestay: 'Eyestay Webbing',
  trim: 'Trim Piping',
  mark: 'Swoosh Mark',
  chassis: 'Chassis Midsole Foam',
  plate: 'Plate TPU',
  outsole: 'Outsole Rubber',
  column: 'Shox Column PU',
}

/** Zones that belong to the sole and drop away on an exploded view. */
const GROUNDED = new Set(['outsole'])

/**
 * Vite in middleware mode, used purely as a module loader: it resolves the `@/`
 * alias and strips the types, so this script runs the site's own geometry rather
 * than a transcription of it. `three` itself stays externalised, which is what makes
 * the classes here identical to the ones the geometry modules build with.
 */
const server = await createServer({
  root: ROOT,
  configFile: resolve(ROOT, 'vite.config.ts'),
  logLevel: 'warn',
  server: { middlewareMode: true },
  appType: 'custom',
})

try {
  const THREE = await import('three')
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
  const { buildShoe, columnMatrix } = await server.ssrLoadModule('/src/three/product/geometry/index.ts')
  const { DEFAULT_COLORWAY, colorwayById } = await server.ssrLoadModule('/src/config/product.ts')

  const surfaces = colorwayById(DEFAULT_COLORWAY).surfaces

  /**
   * One zone's surface as a glTF material. The loader replaces all of these with
   * `ShoeMaterials` on the way in — they exist so the file is not grey when somebody
   * opens it, and so the default colourway is recorded in the asset itself.
   */
  const material = (zone) => {
    const spec = surfaces[zone]
    const made = new THREE.MeshPhysicalMaterial({
      name: MATERIAL_NAMES[zone],
      color: new THREE.Color(spec.color),
      roughness: spec.roughness,
      metalness: spec.metalness,
    })
    if (spec.clearcoat) {
      made.clearcoat = spec.clearcoat
      made.clearcoatRoughness = spec.clearcoatRoughness ?? 0
    }
    if (spec.sheen) {
      made.sheen = spec.sheen
      made.sheenColor = new THREE.Color(spec.sheenColor ?? '#ffffff')
    }
    return made
  }
  // PLACEHOLDER_BODY
} finally {
  await server.close()
}
