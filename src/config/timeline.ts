import type {
  CameraKeyframe,
  ChapterAlign,
  EnvKeyframe,
  LightKeyframe,
  LightState,
  PostKeyframe,
  ProductKeyframe,
  Vec3,
} from '@/types'

/**
 * The five timelines.
 *
 * Everything the 3D scene does is a function of one number: normalised scroll
 * progress, 0 at the top of the page and 1 at the bottom. Camera, lighting,
 * environment, product transform and post-processing each have their own
 * keyframe table sampled by that number, which is what makes the seven chapters
 * read as a single continuous shot instead of seven separate scenes.
 *
 * Keyframe progress values are authored against the chapter boundaries in
 * `chapters.ts` (desktop): intro 0–0.101, shape 0.101–0.240, columns
 * 0.240–0.411, materials 0.411–0.566, movement 0.566–0.713, colour 0.713–0.868,
 * shop 0.868–1. Retiming a chapter there shifts the DOM but not these keys, so
 * keep the two in step when you change a chapter's height.
 *
 * The shoe sits on y = 0, runs along x from −1.31 (heel) to +1.31 (toe), and is
 * roughly 0.99 tall. Distances below are in those units.
 *
 * Shots of the whole product carry `contain: 1`; the sole and material close-ups
 * leave it off, because cropping into them is the shot. See `CameraRig`.
 */

/* ------------------------------------------------------------------ camera */

export const CAMERA_KEYS: readonly CameraKeyframe[] = [
  // Intro — a wide, patient establishing shot that closes in as the copy lands.
  { progress: 0.0, label: 'hero-wide', position: [0.0, 1.34, 4.7], target: [0, 0.47, 0], fov: 30, contain: 1 },
  { progress: 0.06, label: 'hero-settle', position: [0.28, 0.98, 4.05], target: [0, 0.45, 0], fov: 30, contain: 1, ease: 'smoother' },

  // The shape — orbit back along the profile at eye level, with the product low
  // in frame and the copy above it. The shoe is 2.62 long, so a broadside profile
  // spans ~88% of the frame at these distances: there is no room beside it for a
  // copy column, which is why this chapter is centred rather than split. Raising
  // the target above the shoe's mid-height is what drops it into the lower two
  // thirds and leaves the headline a clear band.
  //
  // The target leads the eye to the right of the shoe's centreline by roughly the
  // amount the orbit swings left. Aim at x = 0 instead and the near heel — which
  // grows as the camera comes round to it — pushes the toe off the right edge:
  // measured, that costs 26px of toe at the chapter's end. These three targets put
  // the silhouette within ~1% of centred at every point in the orbit.
  { progress: 0.101, label: 'shape-in', position: [0.15, 0.86, 3.5], target: [0.11, 0.6, 0], fov: 31, contain: 1, ease: 'smooth' },
  { progress: 0.17, label: 'shape-mid', position: [-0.25, 0.8, 3.28], target: [0.03, 0.7, 0], fov: 31, contain: 1 },
  { progress: 0.24, label: 'shape-heel', position: [-0.72, 0.72, 3.02], target: [-0.09, 0.62, 0], fov: 32, contain: 1 },

  // Columns — push in to the sole, then get underneath it. The approach starts
  // further out than the sole close-ups need so the dolly rate rises smoothly out
  // of the shape chapter instead of jumping sixfold at the boundary.
  { progress: 0.29, label: 'column-approach', position: [-0.34, 0.46, 2.42], target: [-0.18, 0.3, 0], fov: 34, ease: 'inOutCubic' },
  { progress: 0.34, label: 'column-close', position: [0.02, 0.2, 1.42], target: [0.0, 0.17, 0], fov: 36 },
  { progress: 0.38, label: 'column-low', position: [0.42, 0.1, 1.28], target: [0.16, 0.15, 0], fov: 36 },
  { progress: 0.411, label: 'column-out', position: [0.1, 0.3, 1.8], target: [0.02, 0.22, 0], fov: 35, ease: 'smooth' },

  // Materials — two tight studies, heel counter then woven upper.
  { progress: 0.46, label: 'detail-heel', position: [-0.86, 0.52, 1.3], target: [-0.74, 0.45, 0], fov: 34 },
  { progress: 0.52, label: 'detail-mesh', position: [0.3, 0.56, 1.15], target: [0.26, 0.47, 0], fov: 34 },
  { progress: 0.566, label: 'detail-out', position: [0.18, 0.74, 2.05], target: [0.04, 0.43, 0], fov: 33, ease: 'outCubic' },

  // Movement — the only place the camera swings hard, with a touch of roll.
  { progress: 0.63, label: 'move-side', position: [-1.1, 0.6, 2.6], target: [0.12, 0.4, 0], fov: 38, roll: -0.035, contain: 1, ease: 'inOutQuint' },
  { progress: 0.68, label: 'move-swing', position: [1.2, 0.84, 2.55], target: [-0.08, 0.44, 0], fov: 38, roll: 0.03, contain: 1, ease: 'inOutQuint' },
  { progress: 0.713, label: 'move-out', position: [0.35, 0.9, 3.1], target: [0.0, 0.45, 0], fov: 33, contain: 1, ease: 'smoother' },

  // Colour — hold steady and wide. The finish is the event, not the camera, and
  // this is the one chapter where the whole shoe has to stay inside the frame
  // while a copy column sits beside it: `right` asks for the product to sit 0.30
  // half-widths left of centre, and around p ≈ 0.85 the shoe turns broadside and
  // projects at its longest. Composing that by hand took three passes and still
  // clipped the heel by 0.08 NDC at 16:10; `contain` is the fix — the rig measures
  // the silhouette and gives back only as much of the pan as fits.
  { progress: 0.79, label: 'colour-hold', position: [0.24, 0.86, 4.05], target: [0.0, 0.5, 0], fov: 31, contain: 1 },
  { progress: 0.868, label: 'colour-out', position: [-0.25, 0.87, 3.91], target: [0.0, 0.46, 0], fov: 31, contain: 1 },

  // Shop — back to a hero composition so the product panel has a poster to sit against.
  { progress: 0.94, label: 'final', position: [0.42, 0.96, 3.8], target: [0.02, 0.47, 0], fov: 29, contain: 1, ease: 'smoother' },
  { progress: 1.0, label: 'final-hold', position: [0.26, 1.02, 4.0], target: [0.02, 0.48, 0], fov: 29, contain: 1 },
]

/* ------------------------------------------------------------------ lights */

const L = (intensity: number, position: Vec3, color: string): LightState => ({ intensity, position, color })

/**
 * A four-light studio rig: key from the front top, cool fill opposite, rim from
 * behind to cut the silhouette off the background, and a low warm kicker that
 * only ever gets strong enough to read on the sole. The product must stay
 * readable in every chapter — nothing here is allowed to sink it into black.
 */
export const LIGHT_KEYS: readonly LightKeyframe[] = [
  {
    progress: 0.0,
    key: L(2.4, [2.9, 4.4, 3.2], '#ffffff'),
    fill: L(0.45, [-3.8, 1.5, 2.4], '#8fa8cf'),
    rim: L(3.4, [-2.4, 2.2, -3.9], '#e6eefb'),
    kicker: L(0.5, [0.4, -1.1, 2.2], '#ff5f3d'),
    ambient: 0.1,
    envIntensity: 0.6,
  },
  {
    progress: 0.101,
    key: L(3.1, [2.6, 4.0, 3.4], '#ffffff'),
    fill: L(0.85, [-3.6, 1.4, 2.6], '#9fb4d8'),
    rim: L(2.7, [-2.2, 2.0, -3.8], '#dfe8f6'),
    kicker: L(0.7, [0.4, -1.2, 2.2], '#ff5a3c'),
    ambient: 0.16,
    envIntensity: 0.85,
    ease: 'smooth',
  },
  {
    progress: 0.24,
    key: L(3.0, [1.9, 3.6, 3.6], '#fdfdff'),
    fill: L(1.0, [-3.4, 1.2, 2.2], '#a6bade'),
    rim: L(3.0, [-2.8, 1.8, -3.6], '#dbe6f7'),
    kicker: L(1.4, [0.2, -1.0, 1.9], '#ff5a3c'),
    ambient: 0.18,
    envIntensity: 0.95,
  },
  {
    // Columns: the kicker comes up so light rakes across the spools from below.
    progress: 0.34,
    key: L(2.6, [1.4, 2.6, 3.2], '#ffffff'),
    fill: L(1.15, [-2.8, 0.7, 2.4], '#b3c6e6'),
    rim: L(3.6, [-1.6, 1.1, -3.2], '#eef4ff'),
    kicker: L(2.6, [0.3, -0.7, 1.6], '#ff6a45'),
    ambient: 0.22,
    envIntensity: 1.0,
  },
  {
    progress: 0.411,
    key: L(2.9, [1.8, 3.0, 3.4], '#ffffff'),
    fill: L(1.05, [-3.0, 1.0, 2.4], '#adc0e2'),
    rim: L(3.2, [-2.0, 1.6, -3.4], '#e8f0ff'),
    kicker: L(1.6, [0.3, -0.9, 1.8], '#ff5f3d'),
    ambient: 0.2,
    envIntensity: 1.05,
    ease: 'smooth',
  },
  {
    // Materials: highest environment contribution — reflections do the talking.
    progress: 0.52,
    key: L(3.4, [1.6, 3.2, 2.8], '#ffffff'),
    fill: L(1.3, [-2.6, 1.3, 2.8], '#b8c9e8'),
    rim: L(2.4, [-2.2, 2.2, -3.0], '#f2f6ff'),
    kicker: L(0.9, [0.5, -0.8, 2.0], '#ff6a45'),
    ambient: 0.24,
    envIntensity: 1.35,
  },
  {
    // Movement: hard contrast, rim-led, so the silhouette snaps as it swings.
    progress: 0.66,
    key: L(2.2, [3.2, 3.4, 2.2], '#fff4ee'),
    fill: L(0.55, [-3.9, 1.0, 2.0], '#8ea6cf'),
    rim: L(4.4, [-2.6, 2.4, -3.6], '#ffffff'),
    kicker: L(1.9, [-0.6, -1.0, 1.4], '#ff4a28'),
    ambient: 0.14,
    envIntensity: 0.9,
    ease: 'inOutCubic',
  },
  {
    // Colour: neutral and bright so each finish reads true.
    progress: 0.79,
    key: L(3.3, [2.4, 4.0, 3.4], '#ffffff'),
    fill: L(1.4, [-3.2, 1.6, 2.8], '#c3d2ee'),
    rim: L(2.6, [-2.2, 2.0, -3.6], '#eaf1ff'),
    kicker: L(0.8, [0.4, -1.0, 2.2], '#ff6a45'),
    ambient: 0.26,
    envIntensity: 1.25,
    ease: 'smooth',
  },
  {
    progress: 1.0,
    key: L(3.2, [2.8, 4.2, 3.6], '#ffffff'),
    fill: L(1.2, [-3.4, 1.6, 2.6], '#bccbe8'),
    rim: L(3.0, [-2.4, 2.2, -3.8], '#eef4ff'),
    kicker: L(0.7, [0.4, -1.1, 2.2], '#ff5f3d'),
    ambient: 0.22,
    envIntensity: 1.1,
  },
]

/* ------------------------------------------------------------- environment */

/**
 * The room the shoe stands in. It is never flat black: a graded backdrop, a
 * band of haze behind the product, a soft floor and a few architectural slabs
 * that drift with the camera. Chapter by chapter the room changes temperature
 * and the floor goes from matte to wet-look, which is most of what makes the
 * scroll feel like travel rather than a slideshow.
 */
export const ENV_KEYS: readonly EnvKeyframe[] = [
  {
    progress: 0.0,
    background: '#05060a',
    haze: '#1b2740',
    hazeStrength: 0.55,
    fogNear: 5.5,
    fogFar: 15,
    floorOpacity: 0.35,
    floorReflect: 0.2,
    slabOpacity: 0.0,
    gridOpacity: 0.0,
  },
  {
    progress: 0.101,
    background: '#070910',
    haze: '#243352',
    hazeStrength: 0.7,
    fogNear: 6,
    fogFar: 17,
    floorOpacity: 0.55,
    floorReflect: 0.35,
    slabOpacity: 0.18,
    gridOpacity: 0.05,
    ease: 'smooth',
  },
  {
    progress: 0.24,
    background: '#080b13',
    haze: '#2b3c5f',
    hazeStrength: 0.8,
    fogNear: 5,
    fogFar: 14,
    floorOpacity: 0.7,
    floorReflect: 0.45,
    slabOpacity: 0.32,
    gridOpacity: 0.22,
  },
  {
    // Technology: the grid comes up, the room reads like a test rig.
    progress: 0.34,
    background: '#090c14',
    haze: '#33465f',
    hazeStrength: 0.95,
    fogNear: 3.4,
    fogFar: 11,
    floorOpacity: 0.8,
    floorReflect: 0.55,
    slabOpacity: 0.26,
    gridOpacity: 0.5,
  },
  {
    progress: 0.52,
    background: '#0b0e16',
    haze: '#3a4c69',
    hazeStrength: 0.85,
    fogNear: 3.2,
    fogFar: 10,
    floorOpacity: 0.85,
    floorReflect: 0.68,
    slabOpacity: 0.4,
    gridOpacity: 0.16,
    ease: 'smooth',
  },
  {
    // Movement: wet floor, deep haze, slabs sliding past.
    progress: 0.66,
    background: '#080a11',
    haze: '#412f3f',
    hazeStrength: 1.1,
    fogNear: 4,
    fogFar: 13,
    floorOpacity: 0.9,
    floorReflect: 0.92,
    slabOpacity: 0.55,
    gridOpacity: 0.08,
    ease: 'inOutCubic',
  },
  {
    // Colour: the cleanest room in the film, so nothing tints the finishes.
    progress: 0.79,
    background: '#0d1017',
    haze: '#38496a',
    hazeStrength: 0.7,
    fogNear: 6,
    fogFar: 18,
    floorOpacity: 0.8,
    floorReflect: 0.6,
    slabOpacity: 0.3,
    gridOpacity: 0.0,
    ease: 'smooth',
  },
  {
    progress: 1.0,
    background: '#0e1118',
    haze: '#33445f',
    hazeStrength: 0.6,
    fogNear: 6.5,
    fogFar: 19,
    floorOpacity: 0.7,
    floorReflect: 0.5,
    slabOpacity: 0.2,
    gridOpacity: 0.0,
  },
]

/* ----------------------------------------------------------------- product */

/**
 * The shoe's own transform. `rotation.y` is interpolated raw rather than by
 * shortest path, so the movement chapter's full revolution reads as a real spin;
 * it lands on −6.90 rad at the shop chapter, which is the opening 3/4 view one
 * turn later.
 *
 * `compress` loads the column array, `explode` pulls the sole apart. Both are
 * consumed by `columnMatrix`, and the sprung half of the shoe follows them.
 */
export const PRODUCT_KEYS: readonly ProductKeyframe[] = [
  { progress: 0.0, rotation: [0, -0.62, 0], position: [0, 0, 0], scale: 1, explode: 0, compress: 0 },
  { progress: 0.06, rotation: [0, -0.52, 0], position: [0, 0, 0], scale: 1, explode: 0, compress: 0, ease: 'smoother' },
  { progress: 0.101, rotation: [0.02, -0.34, 0], position: [0, 0, 0], scale: 1, explode: 0, compress: 0, ease: 'smooth' },
  { progress: 0.17, rotation: [0.04, -0.12, 0], position: [0, 0, 0], scale: 1.01, explode: 0, compress: 0 },
  { progress: 0.24, rotation: [0.02, 0.1, 0], position: [0, 0, 0], scale: 1.02, explode: 0, compress: 0 },

  // Teardown: pull the sole apart, hold it open, put it back together.
  { progress: 0.28, rotation: [0, 0.16, 0], position: [0, 0, 0], scale: 1.03, explode: 0.92, compress: 0, ease: 'outCubic' },
  { progress: 0.315, rotation: [0, 0.22, 0], position: [0, 0, 0], scale: 1.03, explode: 0.92, compress: 0, ease: 'linear' },
  { progress: 0.345, rotation: [0, 0.26, 0], position: [0, 0, 0], scale: 1.03, explode: 0, compress: 0, ease: 'inOutCubic' },
  // …then load it once, hard, and let it come back.
  { progress: 0.368, rotation: [0, 0.28, 0], position: [0, 0, 0], scale: 1.03, explode: 0, compress: 1, ease: 'outCubic' },
  { progress: 0.396, rotation: [0, 0.29, 0], position: [0, 0, 0], scale: 1.02, explode: 0, compress: 0.06, ease: 'outExpo' },
  { progress: 0.411, rotation: [0, 0.3, 0], position: [0, 0, 0], scale: 1.02, explode: 0, compress: 0 },

  // Materials: heel counter to camera, then swing back to the woven flank.
  { progress: 0.46, rotation: [0.03, 0.86, 0], position: [0, 0, 0], scale: 1, explode: 0, compress: 0, ease: 'inOutCubic' },
  { progress: 0.52, rotation: [0.02, -0.3, 0], position: [0, 0, 0], scale: 1, explode: 0, compress: 0, ease: 'inOutCubic' },
  { progress: 0.566, rotation: [0, -0.42, 0], position: [0, 0, 0], scale: 1, explode: 0, compress: 0 },

  // Movement: one full revolution while the columns pump twice.
  { progress: 0.6, rotation: [0, -1.2, 0], position: [0, 0.01, 0], scale: 1.03, explode: 0, compress: 0.9, ease: 'inOutCubic' },
  { progress: 0.635, rotation: [0, -2.1, 0], position: [0, 0.08, 0], scale: 1.04, explode: 0, compress: 0.1, ease: 'outExpo' },
  { progress: 0.665, rotation: [0, -3.1, 0], position: [0, 0.01, 0], scale: 1.04, explode: 0, compress: 0.85, ease: 'inOutCubic' },
  { progress: 0.695, rotation: [0, -4.1, 0], position: [0, 0.07, 0], scale: 1.03, explode: 0, compress: 0.12, ease: 'outExpo' },
  { progress: 0.713, rotation: [0, -4.7, 0], position: [0, 0, 0], scale: 1.02, explode: 0, compress: 0, ease: 'smooth' },

  // Colour, then the closing hero. The colour hold sits at 38° off broadside
  // rather than 25°: a three-quarter view shows the upper, the toe and the sole
  // at once — which is what you want when judging a finish — and it foreshortens
  // the shoe enough to clear the frame edge once the copy column's pan is applied.
  { progress: 0.79, rotation: [0, -5.62, 0], position: [0, 0, 0], scale: 1, explode: 0, compress: 0, ease: 'smooth' },
  { progress: 0.868, rotation: [0, -6.55, 0], position: [0, 0, 0], scale: 1, explode: 0, compress: 0 },
  { progress: 0.94, rotation: [0, -6.9, 0], position: [0, 0, 0], scale: 0.97, explode: 0, compress: 0, ease: 'smoother' },
  { progress: 1.0, rotation: [0, -7.02, 0], position: [0, 0, 0], scale: 0.96, explode: 0, compress: 0 },
]

/* -------------------------------------------------------- post-processing */

/**
 * Deliberately restrained. Bloom only lifts the specular highlights, grain sits
 * around 3%, and depth of field is focused on the camera target so the sneaker
 * itself is always the sharpest thing on screen.
 *
 * There is no authored focus distance: the rig focuses on the real camera-to-target
 * distance it computed this frame. A column of hand-copied distances here would
 * only be one edit away from disagreeing with `CAMERA_KEYS`, and a depth of field
 * focused 30 cm behind the product is the most expensive-looking bug available.
 *
 * `exposure` is ACES-referred, which is why it sits above 1: the filmic curve in
 * `PostFX` divides by 0.6 on the way in and rolls the top end off, so 1.30 is what
 * puts a mid-grey where an untone-mapped 1.0 used to put it. Below about 1.25 the
 * knit weave on the upper starts disappearing into the shadow toe of the curve —
 * the product has to stay legible, so the ramp is scaled, not the black point.
 */
export const POST_KEYS: readonly PostKeyframe[] = [
  { progress: 0.0, bloomIntensity: 0.55, bloomThreshold: 0.82, vignette: 0.62, dofBokeh: 2.6, grain: 0.045, chroma: 0.0012, exposure: 1.3 },
  { progress: 0.101, bloomIntensity: 0.45, bloomThreshold: 0.85, vignette: 0.5, dofBokeh: 1.8, grain: 0.035, chroma: 0.0008, exposure: 1.365, ease: 'smooth' },
  { progress: 0.24, bloomIntensity: 0.42, bloomThreshold: 0.86, vignette: 0.46, dofBokeh: 1.6, grain: 0.03, chroma: 0.0007, exposure: 1.378 },
  { progress: 0.34, bloomIntensity: 0.6, bloomThreshold: 0.8, vignette: 0.42, dofBokeh: 2.2, grain: 0.03, chroma: 0.0009, exposure: 1.404 },
  { progress: 0.411, bloomIntensity: 0.5, bloomThreshold: 0.83, vignette: 0.44, dofBokeh: 1.9, grain: 0.03, chroma: 0.0008, exposure: 1.378 },
  { progress: 0.52, bloomIntensity: 0.7, bloomThreshold: 0.78, vignette: 0.4, dofBokeh: 2.8, grain: 0.028, chroma: 0.0006, exposure: 1.43, ease: 'smooth' },
  { progress: 0.566, bloomIntensity: 0.55, bloomThreshold: 0.82, vignette: 0.45, dofBokeh: 2.0, grain: 0.03, chroma: 0.0008, exposure: 1.378 },
  { progress: 0.66, bloomIntensity: 0.85, bloomThreshold: 0.74, vignette: 0.6, dofBokeh: 3.2, grain: 0.055, chroma: 0.0018, exposure: 1.326, ease: 'inOutCubic' },
  { progress: 0.713, bloomIntensity: 0.6, bloomThreshold: 0.8, vignette: 0.5, dofBokeh: 2.2, grain: 0.04, chroma: 0.001, exposure: 1.365, ease: 'smooth' },
  { progress: 0.79, bloomIntensity: 0.45, bloomThreshold: 0.86, vignette: 0.42, dofBokeh: 1.6, grain: 0.028, chroma: 0.0006, exposure: 1.456, ease: 'smooth' },
  { progress: 0.868, bloomIntensity: 0.45, bloomThreshold: 0.86, vignette: 0.42, dofBokeh: 1.6, grain: 0.028, chroma: 0.0006, exposure: 1.456 },
  { progress: 1.0, bloomIntensity: 0.5, bloomThreshold: 0.84, vignette: 0.5, dofBokeh: 1.9, grain: 0.032, chroma: 0.0007, exposure: 1.404 },
]

/* ------------------------------------------------------------------ framing */

/**
 * Lateral pan applied on top of the camera table so the product sits opposite
 * the copy, expressed as a **fraction of the half-width visible at the camera
 * target**. Authoring it as a fraction rather than in world units keeps the
 * composition identical at every viewport and focal length — a 0.30 shift puts
 * the product's centre 15% of the screen width off centre whether the camera is
 * 1.2 or 4.7 units away.
 *
 * Panning the eye and the target together keeps the composition parallel — no
 * keystoning, no perspective wobble — and because screen-right is +x, a positive
 * shift pushes the shoe to the left of frame.
 *
 * Zeroed on mobile, where copy stacks above and below a centred product.
 */
export const FRAMING_SHIFT: Record<ChapterAlign, number> = {
  center: 0,
  left: -0.3,
  right: 0.3,
  split: 0.42,
}



