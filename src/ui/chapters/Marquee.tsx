import { useEffect, useRef } from 'react'
import { scroll } from '@/state/scroll'
import { useExperience } from '@/state/useExperience'

/**
 * Kinetic marquee for the movement chapter.
 *
 * The band drifts on its own and speeds up with scroll velocity, so the type
 * reads as something being carried past rather than a loop playing regardless of
 * what the user does. Direction follows the scroll direction.
 *
 * Two identical tracks, translated by a wrapped offset — the seam is always off
 * screen. Written straight to `style.transform` from the one rAF loop; a CSS
 * keyframe animation could not react to velocity, and React state could not do it
 * sixty times a second for free.
 *
 * Under `prefers-reduced-motion` it holds still and simply reads as a rule of
 * text, which is why the words themselves have to make sense stationary.
 */

const PHRASE = 'Load · Compress · Return'
/** Base drift in % of one track per second. */
const DRIFT = 3.4
/** Extra % per unit of normalised scroll velocity. */
const KICK = 46

export function Marquee() {
  const reduced = useExperience((s) => s.reducedMotion)
  const trackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (reduced) return
    let raf = 0
    let last = performance.now()
    let offset = 0

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 20)
      last = now
      offset -= (DRIFT + Math.abs(scroll.kinetic) * KICK) * dt * (scroll.direction >= 0 ? 1 : -1)
      // One track is 50% of the doubled row, so wrapping there is seamless.
      if (offset <= -50) offset += 50
      if (offset > 0) offset -= 50
      const node = trackRef.current
      if (node) node.style.transform = `translate3d(${offset.toFixed(3)}%, 0, 0)`
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduced])

  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee__track" ref={trackRef}>
        {[0, 1].map((copy) => (
          <span className="marquee__run" key={copy}>
            {[0, 1, 2].map((i) => (
              <span className="marquee__item type-display" key={i}>
                {PHRASE}
                <span className="marquee__dot">·</span>
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  )
}
