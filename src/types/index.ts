/**
 * Shared type contract for the Shox experience.
 *
 * The whole experience is data-driven: five independent timelines (camera, light,
 * product, post-processing, environment) are sampled by a single normalised
 * scroll progress value, which is what makes the page read as one continuous
 * shot rather than a stack of sections.
 */

export type Vec3 = readonly [number, number, number]

/* ------------------------------------------------------------------ product */

export type ColorwayId = 'onyx' | 'summit' | 'chrome' | 'crimson'

/** Every distinct surface of the sneaker that a colorway can address. */
export type MaterialZone =
  | 'meshBase' // engineered mesh of the upper
  | 'tpuRib' // the glossy rib cage
  | 'heelClip' // sculpted heel counter
  | 'toeBumper' // glossy toe wrap
  | 'collar' // padded ankle collar
  | 'tongue'
  | 'lace'
  | 'eyestay'
  | 'chassis' // foam wedge sitting on the top plate
  | 'plate' // top + bottom Shox plates
  | 'column' // the spool columns
  | 'outsole' // rubber tread
  | 'mark' // side impact mark
  | 'trim' // small metallic accents / lace tips

export interface SurfaceSpec {
  color: string
  roughness: number
  metalness: number
  /** Clearcoat only applied to physical-material zones (TPU, patent, plates). */
  clearcoat?: number
  clearcoatRoughness?: number
  sheen?: number
  sheenColor?: string
  emissive?: string
  emissiveIntensity?: number
}

export interface Colorway {
  id: ColorwayId
  name: string
  /** Short technical code shown in the UI, e.g. "CK-001". */
  code: string
  /** Swatch shown in the selector — two stops make the material legible at 20px. */
  swatch: readonly [string, string]
  /** Accent used by the DOM layer while this colorway is active. */
  accent: string
  surfaces: Record<MaterialZone, SurfaceSpec>
}

export interface SizeOption {
  eu: number
  us: string
  available: boolean
}

export interface ProductSpec {
  brand: string
  name: string
  subtitle: string
  sku: string
  price: number
  currency: string
  currencySymbol: string
  description: string
  sizes: readonly SizeOption[]
  colorways: readonly Colorway[]
  specs: readonly { label: string; value: string }[]
}

/* -------------------------------------------------------------------- cart */

export interface CartItem {
  id: string
  sku: string
  name: string
  colorwayId: ColorwayId
  colorwayName: string
  size: number
  price: number
  quantity: number
}

/* ------------------------------------------------------------- choreography */

export type EaseName = 'linear' | 'smooth' | 'smoother' | 'inOutCubic' | 'outExpo' | 'inOutQuint' | 'outCubic'

export interface CameraKeyframe {
  progress: number
  label: string
  position: Vec3
  target: Vec3
  fov: number
  /** Camera roll in radians. Used sparingly, only in the movement chapter. */
  roll?: number
  /**
   * How strongly this shot insists on the *whole* product staying in frame, 0–1.
   *
   * A keyframe cannot know how wide the shoe will project: that depends on how
   * far it has rotated this frame, on the viewport's aspect, and on the lateral
   * pan the chapter's copy asks for. Shots of the whole product declare this and
   * `CameraRig` measures the silhouette every frame instead. The close-ups leave
   * it unset — cropping into the sole is the point there.
   */
  contain?: number
  ease?: EaseName
}

export interface LightState {
  intensity: number
  position: Vec3
  color: string
}

export interface LightKeyframe {
  progress: number
  key: LightState
  fill: LightState
  rim: LightState
  kicker: LightState
  ambient: number
  /** Multiplier on the Lightformer environment contribution. */
  envIntensity: number
  ease?: EaseName
}

export interface EnvKeyframe {
  progress: number
  /** Scene clear colour. */
  background: string
  /** Colour of the volumetric haze behind the product. */
  haze: string
  hazeStrength: number
  fogNear: number
  fogFar: number
  floorOpacity: number
  /** 0 = matte floor, 1 = wet-look reflective floor. */
  floorReflect: number
  /** Opacity of the architectural backdrop slabs. */
  slabOpacity: number
  gridOpacity: number
  ease?: EaseName
}

export interface ProductKeyframe {
  progress: number
  rotation: Vec3
  position: Vec3
  scale: number
  /** 0 = assembled, 1 = fully separated teardown. */
  explode: number
  /** 0 = at rest, 1 = columns fully loaded (compressed). */
  compress: number
  ease?: EaseName
}

export interface PostKeyframe {
  progress: number
  bloomIntensity: number
  bloomThreshold: number
  vignette: number
  dofBokeh: number
  grain: number
  chroma: number
  exposure: number
  ease?: EaseName
}

export type ChapterAlign = 'left' | 'right' | 'center' | 'split'

export interface ChapterDef {
  index: number
  id: string
  /** Short label for the nav rail, e.g. "01". */
  ordinal: string
  navLabel: string
  /** Which of the four nav destinations this chapter belongs to. */
  navSection: 'story' | 'technology' | 'details' | 'shop' | null
  /** Height of the chapter in viewport heights (desktop / mobile). */
  scrollVh: number
  scrollVhMobile: number
  eyebrow: string
  headline: string
  body?: string
  align: ChapterAlign
  /** Chapter-specific UI slot rendered inside the sticky frame. */
  slot?: 'hero' | 'stats' | 'colorway' | 'shop' | 'marquee' | 'detail-index'
  /** Metric callouts shown alongside the headline. */
  metrics?: readonly { value: string; label: string }[]
}

/** Derived at module load from the chapter table. */
export interface ChapterRange {
  index: number
  id: string
  start: number
  end: number
}

/* ----------------------------------------------------------- runtime state */

export type ExperiencePhase = 'boot' | 'loading' | 'reveal' | 'ready' | 'fallback'

export type PerfTier = 'low' | 'medium' | 'high'

export interface PerfProfile {
  tier: PerfTier
  dpr: readonly [number, number]
  shadowMapSize: number
  contactShadowRes: number
  envResolution: number
  /** Multiplier applied to procedural geometry segment counts. */
  geometryDetail: number
  bloom: boolean
  dof: boolean
  grain: boolean
  chromaticAberration: boolean
  contactShadows: boolean
  antialias: boolean
  /** Human-readable note on why this tier was chosen — surfaced in the debug overlay. */
  reason: string
}
