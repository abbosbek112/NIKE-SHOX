import { Color, MeshPhysicalMaterial, MeshStandardMaterial, Vector2, type Texture } from 'three'
import type { Colorway, MaterialZone, SurfaceSpec } from '@/types'
import { damp } from '@/lib/math'
import { createTextureSet, type TextureSet } from './textures'

/**
 * One material per zone, driven by the colourway table.
 *
 * Colourways change *material properties*, not textures — switching to Chrome
 * animates the column metalness from 0.05 to 1 and the colours travel through
 * linear space over ~0.6 s, so the shoe visibly re-finishes itself rather than
 * cutting to a different picture.
 *
 * Two constraints shape the design:
 *
 * - **No shader recompiles.** three defines `USE_CLEARCOAT` / `USE_SHEEN` from
 *   whether the value is non-zero at compile time. Every colourway uses the same
 *   surface archetype for a given zone, so a zone's clearcoat and sheen are
 *   either always on or always off and no colourway change can flip a define.
 * - **Maps are absolute, specs are relative.** The procedural roughness maps are
 *   authored around a known mid value; `roughness` is divided by that mid so the
 *   product of the two lands on the number the colourway actually asked for.
 */

interface ZoneTextures {
  normal?: keyof TextureSet
  normalScale?: number
  roughness?: keyof TextureSet
  /** Mid value of the roughness map, so `roughness` can stay absolute. */
  roughnessMid?: number
}

const ZONE_TEXTURES: Record<MaterialZone, ZoneTextures> = {
  meshBase: { normal: 'meshNormal', normalScale: 0.6, roughness: 'meshRoughness', roughnessMid: 0.82 },
  tpuRib: { roughness: 'glossRoughness', roughnessMid: 0.13 },
  heelClip: { roughness: 'glossRoughness', roughnessMid: 0.13 },
  toeBumper: { roughness: 'glossRoughness', roughnessMid: 0.13 },
  collar: { normal: 'textileNormal', normalScale: 0.5, roughness: 'meshRoughness', roughnessMid: 0.82 },
  tongue: { normal: 'meshNormal', normalScale: 0.45, roughness: 'meshRoughness', roughnessMid: 0.82 },
  lace: { normal: 'textileNormal', normalScale: 0.7, roughness: 'meshRoughness', roughnessMid: 0.82 },
  eyestay: { normal: 'textileNormal', normalScale: 0.4, roughness: 'glossRoughness', roughnessMid: 0.13 },
  chassis: { normal: 'foamNormal', normalScale: 0.55, roughness: 'foamRoughness', roughnessMid: 0.72 },
  plate: { roughness: 'glossRoughness', roughnessMid: 0.13 },
  column: { roughness: 'glossRoughness', roughnessMid: 0.13 },
  outsole: { normal: 'rubberNormal', normalScale: 0.85, roughness: 'rubberRoughness', roughnessMid: 0.64 },
  mark: { roughness: 'glossRoughness', roughnessMid: 0.13 },
  trim: {},
}

/** Zones whose surface archetype never uses clearcoat or sheen. */
const PLAIN_ZONES: readonly MaterialZone[] = ['chassis', 'outsole', 'trim']

export type ZoneMaterial = MeshStandardMaterial | MeshPhysicalMaterial

const isPhysical = (m: ZoneMaterial): m is MeshPhysicalMaterial => 'clearcoat' in m

/** Mutable copy of the animated slice of a SurfaceSpec. */
interface Animated {
  color: Color
  roughness: number
  metalness: number
  clearcoat: number
  clearcoatRoughness: number
  sheen: number
  sheenColor: Color
}

function readSpec(spec: SurfaceSpec, roughnessMid: number): Animated {
  return {
    color: new Color(spec.color),
    roughness: Math.min(1, spec.roughness / roughnessMid),
    metalness: spec.metalness,
    clearcoat: spec.clearcoat ?? 0,
    clearcoatRoughness: spec.clearcoatRoughness ?? 0,
    sheen: spec.sheen ?? 0,
    sheenColor: new Color(spec.sheenColor ?? '#ffffff'),
  }
}

/** How fast a colourway change resolves. ~0.6 s to visually settle. */
const BLEND_LAMBDA = 7

export class ShoeMaterials {
  readonly materials: Record<MaterialZone, ZoneMaterial>
  readonly textures: TextureSet

  private readonly current: Record<MaterialZone, Animated>
  private readonly target: Record<MaterialZone, Animated>
  private readonly zones: MaterialZone[]
  /** Zones compiled with sheen — writing sheen on any other zone is a no-op. */
  private readonly sheened = new Set<MaterialZone>()
  private settled = true
  private envIntensity: number

  constructor(colorway: Colorway, opts: { anisotropy?: number; detail?: number; simple?: boolean; envIntensity?: number } = {}) {
    const { anisotropy = 4, detail = 1, simple = false, envIntensity = 1 } = opts
    this.textures = createTextureSet(anisotropy, detail)
    this.envIntensity = envIntensity

    this.zones = Object.keys(colorway.surfaces) as MaterialZone[]
    this.materials = {} as Record<MaterialZone, ZoneMaterial>
    this.current = {} as Record<MaterialZone, Animated>
    this.target = {} as Record<MaterialZone, Animated>

    this.zones.forEach((zone) => {
      const spec = colorway.surfaces[zone]
      const tex = ZONE_TEXTURES[zone]
      const mid = tex.roughnessMid ?? 1
      const animated = readSpec(spec, mid)
      this.current[zone] = animated
      this.target[zone] = readSpec(spec, mid)

      // Sheen is the priciest of the extras and reads as a subtle fabric halo;
      // the low profile drops it and keeps clearcoat, which carries the gloss.
      const wantsExtras = !PLAIN_ZONES.includes(zone)
      const useSheen = wantsExtras && !simple && animated.sheen > 0
      if (useSheen) this.sheened.add(zone)
      const material: ZoneMaterial = wantsExtras
        ? new MeshPhysicalMaterial({
            clearcoat: animated.clearcoat,
            clearcoatRoughness: animated.clearcoatRoughness,
            sheen: useSheen ? animated.sheen : 0,
            sheenRoughness: 0.7,
          })
        : new MeshStandardMaterial()

      material.name = zone
      material.color.copy(animated.color)
      material.roughness = animated.roughness
      material.metalness = animated.metalness
      material.envMapIntensity = envIntensity
      material.dithering = true
      if (isPhysical(material)) material.sheenColor.copy(animated.sheenColor)

      const normalMap = tex.normal ? (this.textures[tex.normal] as Texture) : null
      if (normalMap && !simple) {
        material.normalMap = normalMap
        material.normalScale = new Vector2(tex.normalScale ?? 0.5, tex.normalScale ?? 0.5)
      }
      if (tex.roughness) material.roughnessMap = this.textures[tex.roughness] as Texture

      this.materials[zone] = material
    })
  }

  /** Queue a colourway. Properties travel over the next few frames. */
  setColorway(colorway: Colorway): void {
    this.zones.forEach((zone) => {
      const spec = colorway.surfaces[zone]
      const mid = ZONE_TEXTURES[zone].roughnessMid ?? 1
      const t = this.target[zone]
      t.color.set(spec.color)
      t.roughness = Math.min(1, spec.roughness / mid)
      t.metalness = spec.metalness
      t.clearcoat = spec.clearcoat ?? 0
      t.clearcoatRoughness = spec.clearcoatRoughness ?? 0
      t.sheen = spec.sheen ?? 0
      t.sheenColor.set(spec.sheenColor ?? '#ffffff')
    })
    this.settled = false
  }

  /** Environment contribution, driven by the lighting timeline. */
  setEnvIntensity(value: number): void {
    if (Math.abs(value - this.envIntensity) < 1e-4) return
    this.envIntensity = value
    this.zones.forEach((zone) => {
      this.materials[zone].envMapIntensity = value
    })
  }

  /** Advance the colourway blend. Cheap no-op once everything has landed. */
  update(dt: number): void {
    if (this.settled) return
    let moving = false

    this.zones.forEach((zone) => {
      const cur = this.current[zone]
      const to = this.target[zone]
      const material = this.materials[zone]

      const k = 1 - Math.exp(-BLEND_LAMBDA * dt)
      cur.color.lerp(to.color, k)
      cur.sheenColor.lerp(to.sheenColor, k)
      cur.roughness = damp(cur.roughness, to.roughness, BLEND_LAMBDA, dt)
      cur.metalness = damp(cur.metalness, to.metalness, BLEND_LAMBDA, dt)
      cur.clearcoat = damp(cur.clearcoat, to.clearcoat, BLEND_LAMBDA, dt)
      cur.clearcoatRoughness = damp(cur.clearcoatRoughness, to.clearcoatRoughness, BLEND_LAMBDA, dt)
      cur.sheen = damp(cur.sheen, to.sheen, BLEND_LAMBDA, dt)

      material.color.copy(cur.color)
      material.roughness = cur.roughness
      material.metalness = cur.metalness
      if (isPhysical(material)) {
        material.clearcoat = cur.clearcoat
        material.clearcoatRoughness = cur.clearcoatRoughness
        if (this.sheened.has(zone)) {
          material.sheen = cur.sheen
          material.sheenColor.copy(cur.sheenColor)
        }
      }

      if (
        Math.abs(cur.roughness - to.roughness) > 1e-3 ||
        Math.abs(cur.metalness - to.metalness) > 1e-3 ||
        Math.abs(cur.clearcoat - to.clearcoat) > 1e-3 ||
        cur.color.getHex() !== to.color.getHex()
      ) {
        moving = true
      }
    })

    if (!moving) {
      // Snap so nothing sits a thousandth away from the authored value forever.
      this.zones.forEach((zone) => {
        const cur = this.current[zone]
        const to = this.target[zone]
        cur.color.copy(to.color)
        cur.sheenColor.copy(to.sheenColor)
        cur.roughness = to.roughness
        cur.metalness = to.metalness
        cur.clearcoat = to.clearcoat
        cur.clearcoatRoughness = to.clearcoatRoughness
        cur.sheen = to.sheen
        const material = this.materials[zone]
        material.color.copy(to.color)
        material.roughness = to.roughness
        material.metalness = to.metalness
        if (isPhysical(material) && this.sheened.has(zone)) material.sheenColor.copy(to.sheenColor)
      })
      this.settled = true
    }
  }

  dispose(): void {
    this.zones.forEach((zone) => this.materials[zone].dispose())
  }
}
