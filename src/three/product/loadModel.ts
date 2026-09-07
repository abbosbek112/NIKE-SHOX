import { Group, Vector3, type Material, type Mesh, type Object3D } from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { MODEL, PART_NAMES, ZONE_KEYWORDS } from '@/config/model'
import type { ShoeMaterials } from '@/three/materials/materials'
import { measureExtents, measureProduct, type Measured } from '@/three/product/measure'
import type { MaterialZone } from '@/types'

/**
 * Load a dropped-in GLB, and make it interchangeable with the procedural shoe.
 *
 * The procedural shoe is honest geometry, but it is a stand-in: it was modelled to
 * read as a Shox TL from the distances the film shoots from, not to be one. This is
 * the path a real model takes instead. Nothing about it is `useGLTF`: it runs
 * inside `boot()`, on the loading thread, before the canvas exists, so the loader
 * percentage stays a real measure of work and no Suspense boundary can flash an
 * empty scene.
 *
 * Three things happen here, and each is the difference between "a file loads" and
 * "the film still works":
 *
 * 1. **Normalisation.** A model from a scanning app, an image-to-3D service or a
 *    marketplace arrives at an arbitrary scale, an arbitrary yaw, and rarely
 *    standing on its own origin. Every camera keyframe, light position and framing
 *    shift in the timeline is authored against a shoe 2.623 long with its heel at
 *    −x and its sole on y = 0, so the model is turned and scaled to match rather
 *    than the timeline being re-authored around the model.
 * 2. **Measurement.** The camera's containment fit needs the silhouette, which for
 *    the procedural shoe is forty-six hand-measured numbers in `bounds.ts`. Here it
 *    is measured at load time and published, so framing follows a new model on its
 *    own.
 * 3. **Adoption.** Meshes are matched to `MaterialZone`s by name, so the colourway
 *    crossfade drives a real model exactly as it drives the procedural one.
 *
 * Any failure returns `null` and the procedural shoe renders. A missing file is not
 * a failure — it is the normal case, and it says nothing at all.
 */

/** Nodes the teardown and compression chapters drive. Empty for a welded model. */
export interface ModelParts {
  sprung: Object3D[]
  grounded: Object3D[]
  columns: Object3D[]
}

export interface ProductModel {
  /** Normalised root, to mount under the product rig. */
  root: Group
  measured: Measured
  parts: ModelParts
}
const PART_KEYS = ['columns', 'grounded', 'sprung'] as const

/** Names are matched with separators and case removed, so `Heel_Counter.001` hits `counter`. */
function clean(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const TABLE: readonly (readonly [MaterialZone, readonly string[]])[] = ZONE_KEYWORDS.map(
  ([zone, words]) => [zone, words.map(clean)] as const,
)

const PARTS: Record<(typeof PART_KEYS)[number], readonly string[]> = {
  columns: PART_NAMES.columns.map(clean),
  grounded: PART_NAMES.grounded.map(clean),
  sprung: PART_NAMES.sprung.map(clean),
}

/**
 * Is there actually a file there?
 *
 * A HEAD request rather than a try/catch around the load, because the two failures
 * mean opposite things: no file is the shipped state of the project and must stay
 * silent, whereas a file that will not parse is a mistake somebody wants told
 * about. Vite's dev server answers a missing path with `index.html` and a 200, so
 * the content type has to be checked too — otherwise the loader would report a
 * broken model on a project that simply has none.
 */
async function present(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    if (!response.ok) return false
    return !(response.headers.get('content-type') ?? '').includes('text/html')
  } catch {
    return false
  }
}
const AXIS_X = new Vector3(1, 0, 0)
const AXIS_Y = new Vector3(0, 1, 0)

/**
 * Turn, scale and stand the model on the floor.
 *
 * Operates on the inner node so the root the rest of the scene sees stays at
 * identity — the measured hull and the rig's own transform then share one space.
 * World-axis rotations throughout: after the first quarter turn the node's local
 * axes are no longer the room's, and a local `rotateY` would tip the shoe over.
 */
function normalise(inner: Object3D, root: Object3D): void {
  if (MODEL.upAxis === 'z') inner.rotateOnWorldAxis(AXIS_X, -Math.PI / 2)

  let m = measureExtents(root)
  // A shoe is longer than it is wide, so the longest horizontal axis is the one
  // that has to lie along x. This is the only orientation guess that a Z-up export
  // and a Y-up export both need.
  if (m.max[2] - m.min[2] > m.max[0] - m.min[0]) {
    inner.rotateOnWorldAxis(AXIS_Y, Math.PI / 2)
    m = measureExtents(root)
  }

  const length = m.max[0] - m.min[0]
  if (!(length > 0)) throw new Error('model measures zero along its longest axis')
  inner.scale.multiplyScalar(MODEL.length / length)
  m = measureExtents(root)

  // Heel to −x. The taller end is the heel: a collar stands about three times the
  // height of a toe box, where the width difference between the two ends is nearer
  // 25% and gets lost in a scan's noise.
  const heelAtLowX = MODEL.heel === 'auto' ? m.endHeight[0] >= m.endHeight[1] : MODEL.heel === 'low-x'
  if (!heelAtLowX) inner.rotateOnWorldAxis(AXIS_Y, Math.PI)
  if (MODEL.yaw !== 0) inner.rotateOnWorldAxis(AXIS_Y, MODEL.yaw)
  m = measureExtents(root)

  // Centre across x and z; stand the sole on y = 0. Done last, because every step
  // above moves the model as well as turning it.
  inner.position.x -= (m.min[0] + m.max[0]) / 2
  inner.position.z -= (m.min[2] + m.max[2]) / 2
  inner.position.y -= m.min[1] - MODEL.lift * MODEL.length
}
/** Every texture slot a glTF material can fill, so none is left on the GPU. */
const MAP_KEYS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap',
  'bumpMap', 'displacementMap', 'lightMap', 'clearcoatMap', 'clearcoatNormalMap',
  'clearcoatRoughnessMap', 'sheenColorMap', 'sheenRoughnessMap', 'specularColorMap',
  'specularIntensityMap', 'iridescenceMap', 'iridescenceThicknessMap', 'transmissionMap',
  'thicknessMap', 'anisotropyMap',
] as const

/**
 * Release a material the model shipped with, and the maps it held. A photogrammetry
 * scan's baked albedo is routinely 4096², which is not something to leave uploaded
 * once a zone material has replaced it.
 */
function retire(material: Material): void {
  const slots = material as unknown as Record<string, { dispose?: () => void } | null>
  for (const key of MAP_KEYS) {
    slots[key]?.dispose?.()
    slots[key] = null
  }
  material.dispose()
}

/** Mesh name first, then material names; within a name, the most specific zone wins. */
function zoneFor(mesh: Mesh): MaterialZone | null {
  const material = mesh.material
  const names = [mesh.name, ...(Array.isArray(material) ? material.map((m) => m.name) : [material?.name ?? ''])]
  for (const raw of names) {
    const name = clean(raw)
    if (!name) continue
    for (const [zone, words] of TABLE) {
      if (words.some((word) => name.includes(word))) return zone
    }
  }
  return null
}
/**
 * Point every mesh at a zone material, and find the parts the teardown drives.
 *
 * Zone materials replace whatever the file shipped with, because the colour chapter
 * animates material properties and cannot animate a baked texture. `MODEL.
 * useSourceMaterials` opts out for inspecting a raw scan — at the cost of that
 * chapter, which is why it is not the default.
 */
function adopt(inner: Object3D, materials: ShoeMaterials): { parts: ModelParts; unmatched: string[] } {
  const parts: ModelParts = { columns: [], grounded: [], sprung: [] }
  const unmatched: string[] = []
  const retired = new Set<Material>()

  inner.traverse((object) => {
    const name = clean(object.name)
    for (const key of PART_KEYS) {
      if (name && PARTS[key].some((part) => name.includes(part))) {
        parts[key].push(object)
        break
      }
    }

    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const zone = zoneFor(mesh)
    if (!zone) unmatched.push(mesh.name || '(unnamed)')
    if (MODEL.useSourceMaterials) return

    const current = mesh.material
    if (Array.isArray(current)) for (const material of current) retired.add(material)
    else if (current) retired.add(current)
    mesh.material = materials.materials[zone ?? 'meshBase']
  })

  // Only the topmost node of each bucket: a file that names both a group and its
  // child would otherwise take the teardown offset twice.
  const claimed = new Set<Object3D>(PART_KEYS.flatMap((key) => parts[key]))
  for (const key of PART_KEYS) {
    parts[key] = parts[key].filter((node) => {
      for (let p = node.parent; p; p = p.parent) if (claimed.has(p)) return false
      return true
    })
  }

  for (const material of retired) retire(material)
  return { parts, unmatched }
}
/**
 * Draco and meshopt are wired up because both are what a compressed export from a
 * scanning app or a marketplace actually uses, and the decoder is vendored under
 * `public/draco/` rather than fetched from a CDN so the site loads with no third
 * party involved. KTX2 is deliberately absent: `KTX2Loader` needs a renderer to
 * pick a transcode target, and there is no renderer this early.
 */
function createLoader(): { loader: GLTFLoader; dispose: () => void } {
  const loader = new GLTFLoader()
  const draco = new DRACOLoader()
  draco.setDecoderPath('/draco/')
  loader.setDRACOLoader(draco)
  loader.setMeshoptDecoder(MeshoptDecoder)
  return { loader, dispose: () => draco.dispose() }
}

function report(model: ProductModel, unmatched: string[]): void {
  const { measured, parts } = model
  const span = (i: number) => (measured.max[i] - measured.min[i]).toFixed(2)
  const found = PART_KEYS.filter((key) => parts[key].length)
  console.info(
    `[shox] ${MODEL.url}: ${measured.triangles.toLocaleString()} triangles, ` +
      `${span(0)} × ${span(1)} × ${span(2)}, hull ${measured.hull.length / 2} points, parts ` +
      (found.length ? found.join(' + ') : 'none — teardown and compression will no-op'),
  )
  if (unmatched.length) {
    console.info(
      `[shox] ${unmatched.length} mesh(es) matched no material zone and take the upper's finish: ` +
        unmatched.slice(0, 8).join(', ') +
        (unmatched.length > 8 ? ', …' : '') +
        '. Rename them, or extend ZONE_KEYWORDS in src/config/model.ts.',
    )
  }
}

export async function loadProductModel(
  materials: ShoeMaterials,
  onProgress?: (fraction: number) => void,
): Promise<ProductModel | null> {
  if (!(await present(MODEL.url))) return null

  const { loader, dispose } = createLoader()
  let scene: Group
  try {
    const gltf = await loader.loadAsync(MODEL.url, (event) => {
      if (onProgress && event.total > 0) onProgress(Math.min(1, event.loaded / event.total))
    })
    scene = gltf.scene
  } catch (error) {
    console.warn(`[shox] ${MODEL.url} is present but would not load — using the procedural shoe.`, error)
    return null
  } finally {
    dispose()
  }

  try {
    const root = new Group()
    root.name = 'shoe'
    root.add(scene)
    normalise(scene, root)
    const { parts, unmatched } = adopt(scene, materials)
    const model: ProductModel = { root, measured: measureProduct(root), parts }
    report(model, unmatched)
    return model
  } catch (error) {
    console.warn(`[shox] ${MODEL.url} loaded but could not be measured — using the procedural shoe.`, error)
    return null
  }
}
