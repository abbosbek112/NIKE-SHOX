import { useCallback, useEffect, useRef, useState } from 'react'
import { ScrollProvider } from '@/animation/ScrollProvider'
import { CHAPTERS } from '@/config/chapters'
import { colorwayById } from '@/config/product'
import { useDragGesture } from '@/hooks/useDragGesture'
import { PRE_CANVAS_PROGRESS, boot } from '@/lib/boot'
import { installViewportUnits, useReducedMotion } from '@/lib/media'
import { detectWebGL } from '@/lib/webgl'
import { useExperience } from '@/state/useExperience'
import { Experience, type SceneContext } from '@/three/Experience'
import type { ShoeMaterials } from '@/three/materials/materials'
import type { ProductModel } from '@/three/product/loadModel'
import { CartDrawer } from '@/ui/CartDrawer'
import { Chapter } from '@/ui/Chapter'
import { Cursor } from '@/ui/Cursor'
import { Fallback } from '@/ui/Fallback'
import { Footer } from '@/ui/Footer'
import { Loader } from '@/ui/Loader'
import { MobileMenu } from '@/ui/MobileMenu'
import { Nav } from '@/ui/Nav'
import { ScrollRail } from '@/ui/ScrollRail'
import { SpecsPanel } from '@/ui/SpecsPanel'

/**
 * The composition root.
 *
 * Reading order is the page's own layering, back to front: the fixed 3D stage,
 * the film of seven chapters that scrolls over it, the footer that ends it, then
 * the persistent chrome — nav, rail, overlays, cursor — and finally the loader on
 * top of everything until the first real frame exists.
 *
 * The boot sequence is the only stateful thing here. It runs once: build the
 * materials and geometry off-canvas (so the progress bar can move while the main
 * thread is busy), mount the canvas with them, wait for the renderer to compile
 * its shaders, then hand over. `phase` is what the rest of the app watches.
 */

/** Roughly the hero one-shot timeline's length, after which the user is in charge. */
const REVEAL_MS = 2200
/** What the bar shows while the renderer compiles: real work, between 0.78 and 1. */
const COMPILE_PROGRESS = PRE_CANVAS_PROGRESS + 0.1

export function App() {
  const setPhase = useExperience((s) => s.setPhase)
  const setLoadProgress = useExperience((s) => s.setLoadProgress)
  const setReducedMotion = useExperience((s) => s.setReducedMotion)
  const failWebGL = useExperience((s) => s.failWebGL)
  const colorway = useExperience((s) => s.colorway)
  const webglFailed = useExperience((s) => s.webglFailed)
  const reduced = useReducedMotion()

  // Probed once, before anything mounts a canvas.
  const [webgl] = useState(detectWebGL)
  const [materials, setMaterials] = useState<ShoeMaterials | null>(null)
  const [model, setModel] = useState<ProductModel | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const revealTimer = useRef<number | null>(null)

  useDragGesture(stageRef)

  // Stable viewport units before first paint, so a mobile address bar cannot
  // resize every chapter mid-scroll.
  useEffect(() => installViewportUnits(), [])

  // The OS setting is the source of truth; the store is where the scene reads it.
  useEffect(() => {
    setReducedMotion(reduced)
  }, [reduced, setReducedMotion])

  // The accent follows the colourway, so DOM and 3D agree on what red means.
  useEffect(() => {
    document.documentElement.style.setProperty('--c-accent', colorwayById(colorway).accent)
  }, [colorway])

  useEffect(() => {
    if (!webgl.supported) {
      failWebGL()
      return
    }

    let alive = true
    // Read once, imperatively: this effect must run exactly once, and both values
    // are settled before mount.
    const { perf, colorway: initial } = useExperience.getState()
    setPhase('loading')

    boot(perf, initial, (value) => {
      if (alive) setLoadProgress(value)
    })
      .then((result) => {
        if (!alive) {
          result.materials.dispose()
          return
        }
        setMaterials(result.materials)
        setModel(result.model)
      })
      .catch(() => {
        if (alive) failWebGL()
      })

    return () => {
      alive = false
    }
  }, [webgl.supported, setPhase, setLoadProgress, failWebGL])

  // Dispose on unmount only — a colourway change mutates the existing set rather
  // than building a new one, so this never runs mid-session.
  useEffect(
    () => () => {
      if (revealTimer.current) window.clearTimeout(revealTimer.current)
      materials?.dispose()
    },
    [materials],
  )

  const onReady = useCallback(
    async ({ gl, scene, camera }: SceneContext) => {
      setLoadProgress(COMPILE_PROGRESS)
      try {
        // Compile every permutation before the reveal, so the first seconds of
        // the film cannot stutter on a just-in-time shader compile.
        await gl.compileAsync(scene, camera)
      } catch {
        // Not fatal: without it the first frames may hitch, which is still better
        // than refusing to show the product.
      }
      setLoadProgress(1)
      setPhase('reveal')
      revealTimer.current = window.setTimeout(() => setPhase('ready'), REVEAL_MS)
    },
    [setLoadProgress, setPhase],
  )

  if (!webgl.supported || webglFailed) {
    return (
      <>
        <a className="skip-link" href="#fallback-shop">
          Skip to the product
        </a>
        <Nav />
        <MobileMenu />
        <Fallback />
        <Footer />
        <CartDrawer />
        <SpecsPanel />
      </>
    )
  }

  return (
    <>
      <a className="skip-link" href="#chapter-shop">
        Skip to the product
      </a>

      <ScrollProvider>
        <div
          className="stage canvas-focus"
          ref={stageRef}
          tabIndex={0}
          role="figure"
          aria-labelledby="stage-label"
          aria-describedby="stage-help"
        >
          <p className="visually-hidden" id="stage-label">
            Interactive 3D view of the Nike Shox TL
          </p>
          <p className="visually-hidden" id="stage-help">
            Drag to rotate the shoe. With this view focused, the arrow keys turn it.
          </p>
          {materials && <Experience materials={materials} model={model} onReady={onReady} />}
        </div>

        <main className="film" id="film">
          {CHAPTERS.map((chapter) => (
            <Chapter chapter={chapter} key={chapter.id} />
          ))}
        </main>

        <Footer />

        <Nav />
        <MobileMenu />
        <ScrollRail />
        <CartDrawer />
        <SpecsPanel />
        <Cursor />
      </ScrollProvider>

      <Loader />
    </>
  )
}
