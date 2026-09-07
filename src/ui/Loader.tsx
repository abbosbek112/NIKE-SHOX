import { useEffect, useRef, useState } from 'react'
import { damp } from '@/lib/math'
import { useExperience } from '@/state/useExperience'
import { SplitReveal } from '@/ui/type/SplitReveal'

/**
 * The loading screen.
 *
 * The number it shows is the real boot progress (see `lib/boot.ts`), damped
 * toward its target so the count reads as a count rather than as three jumps.
 * Damping is the only cosmetic part: the milestones underneath are actual work.
 *
 * It writes the percentage straight into the DOM node from a rAF loop instead of
 * going through React state, because a component that re-renders sixty times a
 * second while the main thread is busy tessellating a sneaker is exactly the
 * wrong thing to be doing at that moment.
 */

/** How hard the displayed number chases the real one. */
const COUNT_LAMBDA = 6
/** Long enough for the fade to finish before the node leaves the tree. */
const EXIT_MS = 900

export function Loader() {
  const phase = useExperience((s) => s.phase)
  const target = useExperience((s) => s.loadProgress)
  const [mounted, setMounted] = useState(true)
  const numberRef = useRef<HTMLSpanElement>(null)
  const barRef = useRef<HTMLSpanElement>(null)
  const shown = useRef(0)
  const targetRef = useRef(0)

  targetRef.current = target

  useEffect(() => {
    let raf = 0
    let last = performance.now()

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 20)
      last = now
      shown.current = damp(shown.current, targetRef.current, COUNT_LAMBDA, dt)
      // Snap the last fraction of a percent so the readout can actually reach 100.
      if (targetRef.current - shown.current < 0.004) shown.current = targetRef.current

      const pct = Math.round(shown.current * 100)
      if (numberRef.current) numberRef.current.textContent = String(pct).padStart(3, '0')
      if (barRef.current) barRef.current.style.transform = `scaleX(${shown.current.toFixed(4)})`

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Leave the tree only after the fade, so nothing pops.
  const leaving = phase !== 'boot' && phase !== 'loading'
  useEffect(() => {
    if (!leaving) return
    const id = window.setTimeout(() => setMounted(false), EXIT_MS)
    return () => window.clearTimeout(id)
  }, [leaving])

  if (!mounted) return null

  return (
    <div
      className={`loader allow-fade${leaving ? ' loader--out' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Loading the Nike Shox experience"
    >
      <div className="loader__inner">
        <SplitReveal as="p" text="Shox" by="line" className="loader__mark type-mega" />

        <div className="loader__meter">
          <span className="loader__track" aria-hidden="true">
            <span className="loader__fill" ref={barRef} />
          </span>
          <span className="loader__count type-num">
            <span ref={numberRef}>000</span>
            <span aria-hidden="true">%</span>
          </span>
        </div>

        <p className="loader__note type-micro">Generating geometry · materials · lighting</p>
      </div>
    </div>
  )
}
