# Shox — a cinematic 3D product experience

A single-page, scroll-driven product film for the Nike Shox TL, built as a real
front-end application: React + TypeScript, a Three.js scene that never unmounts,
and one normalised scroll position that drives the camera, the lighting, the
product, the environment and the post chain at once. Seven chapters, one
continuous shot — no section is a separate scene.

Original creative work. It is not a copy of Nike's site, layout or type; the
sneaker is modelled in code (see [The 3D model](#the-3d-model)).

## Run it

Node 20.19+ or 22.12+ (built and tested on Node 24.18, npm 11.16).

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

```bash
npm run preview
```

| script | what it does |
| --- | --- |
| `dev` | Vite dev server on `:5173` |
| `build` | `tsc -b` then `vite build` → `dist/` |
| `preview` | serves the built `dist/` |
| `lint` / `typecheck` | type-check only; there is no ESLint config |

## Honest scope

Three things are deliberately *not* pretended:

- **The sneaker is a procedural stand-in, not the production model.** Every
  triangle is real `BufferGeometry` generated at boot — 75.6k triangles across
  fourteen named material zones — but it is an interpretation of a Shox TL, not a
  scan or a licensed asset. The swap-in path for a real GLB is below and is a
  first-class case, not an afterthought.
- **Checkout is not connected.** `src/lib/checkout.ts` is the whole boundary. With
  no `VITE_CHECKOUT_ENDPOINT` set it returns `not-configured` and the UI says so;
  it never fakes a successful payment. Point that variable at an endpoint that
  creates a provider session and replies `{ "url": "https://..." }` and the rest
  of the UI is unchanged.
- **The cart is client-side only**, persisted to `localStorage`. No inventory, no
  server, no order record.

## How the scroll works

One clock, one source of truth. GSAP's ticker drives Lenis; Lenis's callback
writes the `scroll` singleton and then calls `ScrollTrigger.update()`. Nothing
else listens to `wheel` or `scroll`, so the DOM and the WebGL scene can never
disagree about where the page is.

That single normalised progress value (`0..1` across the whole document) is
sampled against five independent keyframe tables in `src/config/timeline.ts`:

| table | drives |
| --- | --- |
| `CAMERA_KEYS` | position, target, fov, roll |
| `LIGHT_KEYS` | key / fill / rim / kicker + ambient + env intensity |
| `ENV_KEYS` | clear colour, haze, fog, floor reflectivity, slabs, grid |
| `PRODUCT_KEYS` | rotation, position, scale, `explode`, `compress` |
| `POST_KEYS` | bloom, vignette, DOF, grain, chroma, exposure |

Editing the film means editing those tables — not the components. Chapter copy,
heights and nav mapping live in `src/config/chapters.ts`; chapter heights are
declared in viewport heights (desktop `130 180 220 200 190 200 170` = 1290vh,
with separate mobile values) and the normalised ranges are derived from them at
module load, so a chapter can be re-timed by changing one number.

<a id="the-3d-model"></a>

## The 3D model

`src/three/product/ProceduralShoe.tsx` builds the shoe from
`src/three/product/geometry/*` — last, upper, sole, columns, laces. Materials and
their procedural PBR textures (canvas-drawn at boot, so the repo ships zero image
assets) live in `src/three/materials/`.

### Dropping in a real GLB

`public/models/` exists for exactly this. Put `shox.glb` there and replace the
`<ProceduralShoe>` element in `src/three/product/Shoe.tsx` with a loader. Two
contracts have to hold; nothing else in the scene changes:

1. **One root group under the product rig**, authored around the origin, heel
   towards −z, about 1.45 world units of half-length and 0.52 of half-height —
   those two numbers are the cursor's over-product ellipse in
   `createProductRig()`, so adjust them there if the model's proportions differ.
2. **A `ShoeHandle` ref**: `apply(compress, explode)` plus a `triangles` count.
   Only the columns and teardown chapters use it; a model without separable parts
   can no-op `apply` and everything else still reads correctly.

Name the GLB's meshes after the `MaterialZone` union in `src/types/index.ts`
(`meshBase`, `tpuRib`, `heelClip`, `column`, `outsole`, …) and it inherits the
existing four colourways and their crossfade for free.

## Layout

```
src/
  animation/    Lenis + GSAP wiring; the one scroll clock
  config/       chapters, product data, the five keyframe timelines
  hooks/        drag gesture, dialog focus trap, radio-group keys
  lib/          boot sequence, perf tiers, checkout boundary, math, media queries
  state/        scroll + pointer singletons (per-frame), zustand stores (React)
  styles/       tokens, then one file per surface
  three/
    camera/     the camera rig
    materials/  material set + procedural textures
    postprocessing/
    product/    the shoe and its geometry builders
    scene/      lights, backdrop, perf watchdog, and the single frame loop
  ui/           DOM layer: nav, chapters, product, cart, loader, cursor
```

Two state systems, on purpose. Values that change every frame — scroll position,
pointer, drag momentum — live in mutable singletons (`src/state/scroll.ts`,
`src/state/pointer.ts`) that `useFrame` reads directly, because routing 60 Hz data
through React would re-render the tree sixty times a second. Values a human
changes — colourway, size, cart, open panels — live in zustand stores.

## Performance

A tier is picked once at boot from the GPU string, core count, device memory,
pointer type and DPR (`src/lib/perf.ts`), and controls DPR range, shadow map
sizes, environment resolution, geometry tessellation and which effects run:

| tier | DPR | geometry | effects dropped |
| --- | --- | --- | --- |
| high | 1–2 | full | — |
| medium | 1–1.5 | 0.75× | DOF, chromatic aberration |
| low | 1–1.35 | 0.5× | + grain, contact shadows, MSAA |

`src/three/scene/PerfGuard.tsx` then watches real frame times and steps the tier
down if frames are both slow and jittery for ~4 seconds. It only ever degrades —
an oscillating quality level is worse than a steady lower one.

Everything the scene allocates is disposed: geometries and textures on unmount,
GSAP contexts and ScrollTriggers with their components, and the drag gesture's
window listeners with the node they were bound to.

## Accessibility

- Every chapter is a real `<section>` with real headings and real copy in the DOM.
  The WebGL layer is decorative; nothing in it is the only source of any fact.
- Full keyboard path: nav, colourways (arrow-key radio group), sizes, add to bag,
  cart drawer and specs panel are all reachable, with a focus trap and `Escape` on
  the two dialogs and visible `:focus-visible` rings throughout.
- The shoe itself is keyboard-rotatable — arrow keys on the stage — and the drag
  target carries its own label rather than relying on the custom cursor.
- `prefers-reduced-motion` is honoured through one store field, so it lands
  everywhere at once: split-text reveals render open, camera drift and parallax
  pin to zero, the marquee freezes, kinetic tilt is dropped and the custom cursor
  turns off. No information is removed — only motion.
- The custom cursor is desktop-only and never the sole affordance.

## Without WebGL

If the context is missing or lost, `src/ui/Fallback.tsx` takes over with the same
product content — name, description, specs, price, colourways, sizes — as static
DOM. `index.html` carries the title, description, Open Graph and Twitter tags,
JSON-LD `Product` data and a `<noscript>` block, so the page is meaningful to a
crawler that never runs a frame.

## Notes

- Fonts (Archivo, Roboto Mono) are self-hosted variable WOFF2 in `public/fonts/`
  with metric-matched fallbacks, so the loader wordmark does not reflow on swap.
- There are no image assets behind the 3D: every texture in the scene is drawn to
  a canvas at boot. The only static graphics in the repo are `public/favicon.svg`
  (an original mark, not a third-party logo) and `public/og.jpg`, which is a
  render of this very scene at 1200×630.
- "Nike" and "Shox" are trademarks of Nike, Inc. This is an unaffiliated
  portfolio exercise, not a Nike product or a copy of any Nike page.
