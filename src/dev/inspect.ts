/**
 * Throwaway geometry inspector. Renders the procedural sneaker from eight angles
 * so the parts can be checked against a reference — in particular the underside,
 * which the film's camera never visits. Not part of the site; delete when done.
 *
 *   npm run dev  →  http://127.0.0.1:5173/inspect.html
 *   ?real=1      →  the site's own materials instead of per-zone debug colours
 */
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  PMREMGenerator,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { DEFAULT_COLORWAY, colorwayById } from '@/config/product'
import { ShoeMaterials } from '@/three/materials/materials'
import { buildShoe, columnMatrix } from '@/three/product/geometry'
import { isInsideOpening, lastPoint, soleTopAt, throatHalf } from '@/three/product/geometry/last'
import { heightV } from '@/three/product/geometry/upper'
import type { MaterialZone } from '@/types'

const DEBUG_COLOURS: Record<MaterialZone, number> = {
  meshBase: 0x8d939c,
  tpuRib: 0x3f6ea8,
  heelClip: 0x7b4fa8,
  toeBumper: 0xc4762e,
  collar: 0x2f8f84,
  tongue: 0xb8508a,
  lace: 0xd8c95a,
  eyestay: 0x7a5c3a,
  trim: 0xf2f2f2,
  mark: 0xe02020,
  chassis: 0x4a4d52,
  plate: 0x2fa8bf,
  column: 0xc9ccd2,
  outsole: 0x22242a,
}

const real = new URLSearchParams(location.search).has('real')
const geometry = buildShoe(1)
const materials = real ? new ShoeMaterials(colorwayById(DEFAULT_COLORWAY), { anisotropy: 4, detail: 1 }) : null

const shoe = new Group()
const zones = Object.keys(DEBUG_COLOURS) as MaterialZone[]
const debugMaterial = (zone: MaterialZone) =>
  new MeshStandardMaterial({ color: new Color(DEBUG_COLOURS[zone]), roughness: 0.45, metalness: 0.05 })

for (const zone of zones) {
  const material = materials ? materials.materials[zone] : debugMaterial(zone)
  if (zone === 'column') {
    const columns = new InstancedMesh(geometry.zones.column, material, geometry.stations.length)
    geometry.stations.forEach((station, i) => columns.setMatrixAt(i, columnMatrix(station, 0, 0)))
    columns.instanceMatrix.needsUpdate = true
    shoe.add(columns)
  } else {
    shoe.add(new Mesh(geometry.zones[zone], material))
  }
}
shoe.add(new Mesh(geometry.lowerPlate, materials ? materials.materials.plate : debugMaterial('plate')))

const scene = new Scene()
scene.background = new Color(0x16181c)
scene.add(shoe)
scene.add(new AmbientLight(0xffffff, 0.35))
const key = new DirectionalLight(0xffffff, 1.5)
key.position.set(2.2, 3.4, -2.6)
scene.add(key)
const fill = new DirectionalLight(0xffffff, 0.7)
fill.position.set(-2.4, -2.2, 2.2)
scene.add(fill)

// ?under=1 → rake a bright light across the underside, so black rubber tread can
// actually be read. Inspection only; the site never lights the shoe from below.
if (new URLSearchParams(location.search).has('under')) {
  const under = new DirectionalLight(0xffffff, 3.2)
  under.position.set(1.6, -3, 0.9)
  scene.add(under)
  scene.add(new AmbientLight(0xffffff, 0.5))
}

const solo = new URLSearchParams(location.search).get('solo')

/**
 * Fixed viewpoints. `dir` is the eye direction from the target, unnormalised;
 * `at` overrides the world target so a view can frame one detail.
 */
const ALL_VIEWS: {
  name: string
  dir: [number, number, number]
  dist: number
  up?: [number, number, number]
  at?: [number, number, number]
}[] = [
  { name: 'lateral (outside)', dir: [0, 0.06, -1], dist: 3.95 },
  { name: 'medial (inside)', dir: [0, 0.06, 1], dist: 3.95 },
  { name: 'top', dir: [0, 1, 0], dist: 3.95, up: [0, 0, 1] },
  { name: 'BOTTOM / outsole', dir: [0, -1, 0], dist: 3.95, up: [0, 0, 1] },
  { name: 'toe', dir: [1, 0.1, 0], dist: 2.5 },
  { name: 'heel', dir: [-1, 0.1, 0], dist: 2.5 },
  { name: '3/4 front', dir: [0.95, 0.5, -1], dist: 4.1 },
  { name: '3/4 rear low', dir: [-0.95, 0.12, -1], dist: 4.1 },
  { name: 'mark, close', dir: [0, 0, -1], dist: 2.15, at: [0.02, 0.5, 0] },
  { name: 'outsole, close', dir: [0, -1, 0.16], dist: 2.6, up: [0, 0, 1], at: [0, 0.1, 0] },
  { name: 'sole, low 3/4', dir: [0.62, -0.34, -1], dist: 3.4, at: [0.05, 0.16, 0] },
]

const VIEWS = solo === null ? ALL_VIEWS : [ALL_VIEWS[Number(solo)]]
const COLS = solo === null ? 4 : 1
const ROWS = solo === null ? Math.ceil(VIEWS.length / COLS) : 1
const CELL_W = solo === null ? 480 : 1180
const CELL_H = solo === null ? 320 : 760
const WIDTH = CELL_W * COLS
const HEIGHT = CELL_H * ROWS

const wrap = document.getElementById('wrap') as HTMLDivElement
wrap.style.width = `${WIDTH}px`
wrap.style.height = `${HEIGHT}px`
const statsEl = document.getElementById('stats') as HTMLDivElement
statsEl.style.top = `${HEIGHT}px`
const renderer = new WebGLRenderer({ antialias: true, alpha: false })
renderer.setPixelRatio(Math.min(2, devicePixelRatio))
renderer.setSize(WIDTH, HEIGHT)
renderer.setScissorTest(true)
renderer.toneMapping = ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
wrap.appendChild(renderer.domElement)

const pmrem = new PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.06).texture
scene.environmentIntensity = 0.55

const target = new Vector3(0, 0.42, 0)
const at = new Vector3()
const camera = new PerspectiveCamera(30, CELL_W / CELL_H, 0.05, 60)

VIEWS.forEach((view, i) => {
  const label = document.createElement('div')
  label.className = 'label'
  label.textContent = view.name
  label.style.left = `${(i % COLS) * CELL_W + 8}px`
  label.style.top = `${Math.floor(i / COLS) * CELL_H + 8}px`
  wrap.appendChild(label)
})

const eye = new Vector3()

function draw() {
  VIEWS.forEach((view, i) => {
    const col = i % COLS
    // Three's viewport origin is bottom-left; the grid above reads top-down.
    const row = ROWS - 1 - Math.floor(i / COLS)
    renderer.setViewport(col * CELL_W, row * CELL_H, CELL_W, CELL_H)
    renderer.setScissor(col * CELL_W, row * CELL_H, CELL_W, CELL_H)
    camera.up.set(...(view.up ?? [0, 1, 0]))
    at.set(...(view.at ?? [target.x, target.y, target.z]))
    eye.set(...view.dir).normalize().multiplyScalar(view.dist)
    camera.position.copy(at).add(eye)
    camera.lookAt(at)
    camera.updateProjectionMatrix()
    renderer.render(scene, camera)
  })
  requestAnimationFrame(draw)
}
requestAnimationFrame(draw)

const stats = document.getElementById('stats') as HTMLDivElement
stats.textContent = [
  `${geometry.triangles.toLocaleString()} triangles`,
  `${geometry.stations.length} columns`,
  `materials: ${real ? 'site' : 'debug zones'}`,
  ...zones.map((zone) => `${zone} ${(geometry.zones[zone].index?.count ?? 0) / 3}`),
].join('   ·   ')

// ?bounds=1 → the union box of every zone plus each zone's own floor, so the
// contact plane can be checked numerically instead of by eye.
if (new URLSearchParams(location.search).has('bounds')) {
  const box = new Box3()
  const each: Record<string, string> = {}
  for (const zone of zones) {
    const g = geometry.zones[zone]
    g.computeBoundingBox()
    if (!g.boundingBox) continue
    box.union(g.boundingBox)
    each[zone] = `y ${g.boundingBox.min.y.toFixed(5)} .. ${g.boundingBox.max.y.toFixed(5)}`
  }
  geometry.lowerPlate.computeBoundingBox()
  if (geometry.lowerPlate.boundingBox) box.union(geometry.lowerPlate.boundingBox)
  console.log(
    JSON.stringify(
      {
        union: {
          min: box.min.toArray().map((n) => Number(n.toFixed(5))),
          max: box.max.toArray().map((n) => Number(n.toFixed(5))),
        },
        zones: each,
      },
      null,
      1,
    ),
  )
}

// ?probe=1 → dump the usable band on the lateral flank, so the side mark can be
// laid out against real numbers instead of guesses.
if (new URLSearchParams(location.search).has('probe')) {
  const rows: Record<string, string>[] = []
  for (let u = 0.2; u <= 0.94001; u += 0.04) {
    let open = 0.5
    for (let v = 0.2; v < 0.5; v += 0.002) {
      if (isInsideOpening(u, v)) {
        open = v
        break
      }
    }
    rows.push({
      u: u.toFixed(3),
      seam: heightV(u, -1, soleTopAt(u) + 0.004).toFixed(4),
      ribFoot: heightV(u, -1, soleTopAt(u) + 0.028).toFixed(4),
      throatHalf: throatHalf(u).toFixed(4),
      ribHead: (0.5 - Math.max(throatHalf(u) + 0.032, 0.062)).toFixed(4),
      open: open.toFixed(4),
      widestY: lastPoint(u, 0.25, new Vector3()).y.toFixed(4),
      soleTop: soleTopAt(u).toFixed(4),
    })
  }
  console.log(JSON.stringify(rows))
}



