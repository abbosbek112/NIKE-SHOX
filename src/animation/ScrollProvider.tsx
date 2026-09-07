import { useEffect, useRef, type ReactNode } from 'react'
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { CHAPTER_RANGES, CHAPTER_RANGES_MOBILE, TOTAL_VH, TOTAL_VH_MOBILE } from '@/config/chapters'
import { useIsMobile, useReducedMotion } from '@/lib/media'
import { resetScroll, setChapterRanges, updateScroll } from '@/state/scroll'
import { useExperience } from '@/state/useExperience'
import { registerScroller } from './scroller'

gsap.registerPlugin(ScrollTrigger)

/**
 * One scroll, three consumers.
 *
 * Lenis owns the actual scroll position. GSAP's ticker drives Lenis, and Lenis's
 * own callback pushes the position into the `scroll` singleton and then tells
 * ScrollTrigger to re-evaluate. That order matters: DOM reveals and the 3D
 * choreography then read the *same* number within a frame, so a headline and the
 * camera move it belongs to can never be one frame apart.
 *
 * Deliberately not done: a second `scroll` listener anywhere else in the app, or
 * ScrollTrigger's own `scrollerProxy` with independent smoothing. Two smoothing
 * systems on one page is the classic way to get a 3D scene that lags its copy.
 */

/** Lenis's own default, restated so the reduced-motion branch has something to differ from. */
const LERP = 0.1
/** Near-instant, but not zero: `prefers-reduced-motion` asks for less motion, not a broken page. */
const LERP_REDUCED = 0.4

/**
 * Scroll progress is measured against the *film*, not the document.
 *
 * The chapter table and every keyframe in `config/timeline.ts` are authored as
 * fractions of the seven chapters' combined height. The document is taller than
 * that — the footer sits below the film in normal flow — so dividing by Lenis's
 * document limit would compress the whole choreography upward and land the
 * closing composition while the colour chapter was still on screen.
 *
 * Measuring the element instead means the footer costs the film nothing:
 * `updateScroll` clamps, so the footer region simply holds progress at 1 and the
 * scene keeps its final composition while the footer is read.
 */
const film = { top: 0, extent: 1 }

function measureFilm(): void {
  const node = document.getElementById('film')
  film.top = node ? node.offsetTop : 0
  const height = node ? node.offsetHeight : document.documentElement.scrollHeight
  film.extent = Math.max(1, height - window.innerHeight)
}

export interface ScrollProviderProps {
  children: ReactNode
}

export function ScrollProvider({ children }: ScrollProviderProps) {
  const mobile = useIsMobile()
  const reduced = useReducedMotion()
  const phase = useExperience((s) => s.phase)
  const lenis = useRef<Lenis | null>(null)

  // Publish the chapter table the page is actually laid out with, so
  // `scroll.chapter` and the DOM section heights agree.
  useEffect(() => {
    setChapterRanges(mobile ? CHAPTER_RANGES_MOBILE : CHAPTER_RANGES)
    document.documentElement.style.setProperty('--total-vh', String(mobile ? TOTAL_VH_MOBILE : TOTAL_VH))
    // Every chapter's height just changed. Measure after the style has applied.
    const id = requestAnimationFrame(() => ScrollTrigger.refresh())
    return () => cancelAnimationFrame(id)
  }, [mobile])

  useEffect(() => {
    const instance = new Lenis({
      lerp: reduced ? LERP_REDUCED : LERP,
      wheelMultiplier: 1,
      touchMultiplier: 1.15,
      // The 3D scene is the thing being scrolled; letting the browser also
      // smooth-scroll touch input would double-integrate the gesture.
      syncTouch: false,
      autoResize: true,
    })
    lenis.current = instance
    registerScroller(instance)

    const onScroll = ({ scroll, velocity }: Lenis) => {
      updateScroll(scroll - film.top, film.extent, velocity)
      // Same frame, after the singleton: DOM triggers see this frame's value.
      ScrollTrigger.update()
    }
    instance.on('scroll', onScroll)

    // GSAP's ticker rather than a private rAF loop, so there is exactly one
    // clock in the app and ScrollTrigger's own callbacks stay in step.
    const tick = (time: number) => instance.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)

    // Seed the singleton before the first frame renders; otherwise a reload
    // part-way down the page would compose chapter one for one frame.
    measureFilm()
    updateScroll(instance.scroll - film.top, film.extent, 0)

    return () => {
      gsap.ticker.remove(tick)
      gsap.ticker.lagSmoothing(500, 33)
      instance.off('scroll', onScroll)
      instance.destroy()
      registerScroller(null)
      lenis.current = null
      resetScroll()
    }
  }, [reduced])

  // Hold the page at the top while the loader is up. Scrolling during a load
  // would otherwise start the film half way through its first chapter.
  useEffect(() => {
    const instance = lenis.current
    if (!instance) return
    if (phase === 'boot' || phase === 'loading') {
      instance.stop()
      instance.scrollTo(0, { immediate: true, force: true })
    } else {
      instance.start()
    }
  }, [phase])

  // A resize changes every chapter's pixel extent, and ScrollTrigger caches those.
  // The film measurement rides on ScrollTrigger's own refresh event, so anything
  // that refreshes — a resize here, a chapter mounting, a font landing — re-measures.
  useEffect(() => {
    ScrollTrigger.addEventListener('refresh', measureFilm)
    const refresh = () => ScrollTrigger.refresh()
    window.addEventListener('resize', refresh)
    window.addEventListener('orientationchange', refresh)
    return () => {
      ScrollTrigger.removeEventListener('refresh', measureFilm)
      window.removeEventListener('resize', refresh)
      window.removeEventListener('orientationchange', refresh)
    }
  }, [])

  return <>{children}</>
}
