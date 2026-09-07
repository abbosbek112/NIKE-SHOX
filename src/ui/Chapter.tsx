import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useIsMobile } from '@/lib/media'
import { useExperience } from '@/state/useExperience'
import { REVEAL_TARGET, SplitReveal } from '@/ui/type/SplitReveal'
import { ChapterSlot } from './chapters/ChapterSlot'
import type { ChapterDef } from '@/types'

// Idempotent, and it means this file works even if it is ever mounted without
// the scroll provider above it.
gsap.registerPlugin(ScrollTrigger)

/**
 * One chapter of the film.
 *
 * The section is tall — 130 to 220 viewport heights — and everything visible
 * inside it lives in a `position: sticky` frame one viewport tall. That is what
 * makes the page read as a single continuous shot: the copy holds still in front
 * of the camera while the scroll distance is spent moving the camera, and the
 * chapter's own text only travels during the hand-off at either end.
 *
 * Three timelines per chapter, all scrubbed:
 *   IN    while the section rises into place, before the frame sticks
 *   HOLD  nothing here moves; the 3D scene has the frame to itself
 *   OUT   a short fade as the frame unsticks and leaves
 *
 * The IN and OUT windows are deliberately shorter than the travel available, so
 * they can never overlap even in the shortest chapter. Chapter one is the
 * exception: it is already at the top of the page on load, so there is no travel
 * to scrub and its entrance is a one-shot timeline fired by the boot hand-off.
 */

/** Fractions of the viewport the IN window occupies, as ScrollTrigger positions. */
const IN_START = 'top 88%'
const IN_END = 'top 14%'
/**
 * The OUT window runs while the frame unsticks.
 *
 * It has to finish early. Once the sticky frame reaches the end of its travel the
 * whole thing scrolls up with the section — a 130vh chapter spends 100vh doing
 * that — so a long fade leaves half-opaque copy climbing through the fixed nav and
 * a half-visible CTA floating over the sneaker. Sixteen viewport heights is enough
 * travel to read as a fade and little enough that the copy is gone before it
 * reaches the nav band.
 */
const OUT_START = 'bottom bottom'
const OUT_END = 'bottom 84%'

export interface ChapterProps {
  chapter: ChapterDef
}

export function Chapter({ chapter }: ChapterProps) {
  const mobile = useIsMobile()
  const reduced = useExperience((s) => s.reducedMotion)
  const phase = useExperience((s) => s.phase)
  const sectionRef = useRef<HTMLElement>(null)

  const isFirst = chapter.index === 0
  const isLast = chapter.index === 6
  const revealed = phase === 'reveal' || phase === 'ready'
  const titleId = `chapter-${chapter.id}-title`

  useEffect(() => {
    const section = sectionRef.current
    if (!section || reduced) return
    // Nothing to reveal until the loader has handed over.
    if (isFirst && !revealed) return

    const ctx = gsap.context((self) => {
      const q = self.selector as (selector: string) => HTMLElement[]
      const lines = q(REVEAL_TARGET)

      /** GSAP warns on empty target lists, and a chapter may have no body or slot. */
      const step = (tl: gsap.core.Timeline, targets: HTMLElement[], from: object, to: object, at: number) => {
        if (targets.length) tl.fromTo(targets, from, to, at)
      }

      // The mask offset is authored in CSS as `translate3d(0, 110%, 0)`, and GSAP
      // reads that back from the computed matrix as a resolved *pixel* `y`. Its
      // transform model is `y + yPercent% of height`, so animating `yPercent`
      // alone lands on `0% + 121px` and the mask never opens. Both ends therefore
      // pin `y: 0` and let `yPercent` carry the whole move — and it has to be
      // `fromTo`, because a bare `to` would inherit that same parsed pixel start.
      const inVars = { yPercent: 110, y: 0, force3D: true }
      const outVars = { yPercent: 0, y: 0, force3D: true }

      if (isFirst) {
        const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })
        step(tl, q('.eyebrow'), { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 1 }, 0.05)
        step(tl, lines, inVars, { ...outVars, duration: 1.7, stagger: 0.1 }, 0.15)
        step(tl, q('.chapter__body'), { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 1.2 }, 0.7)
        step(tl, q('.chapter__slot'), { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 1.1 }, 0.95)
      } else {
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: { trigger: section, start: IN_START, end: IN_END, scrub: true },
        })
        step(tl, q('.eyebrow'), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.35 }, 0)
        step(tl, lines, inVars, { ...outVars, duration: 0.85, stagger: 0.1 }, 0.1)
        step(tl, q('.chapter__body'), { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.5 }, 0.5)
        step(tl, q('.chapter__aside'), { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.55 }, 0.6)
        step(tl, q('.chapter__slot'), { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.55 }, 0.7)
      }

      // The closing chapter keeps its shop panel: it is still reachable while the
      // footer scrolls up behind it, and fading a Buy button out from under the
      // pointer is the one exit this page should not have.
      if (!isLast) {
        gsap.to(q('.chapter__inner'), {
          autoAlpha: 0,
          yPercent: -5,
          ease: 'none',
          scrollTrigger: { trigger: section, start: OUT_START, end: OUT_END, scrub: true },
        })

        // The legibility scrim lives on the frame rather than on the copy block, so
        // it needs its own fade. Once a chapter's travel is spent the frame scrolls
        // up with the section, and a gradient still at full strength arrives over
        // the next chapter as a hard-edged band — most visibly where a centred
        // chapter's dark bottom stop meets the top of the frame beneath it.
        gsap.to(q('.chapter__frame'), {
          autoAlpha: 0,
          ease: 'none',
          scrollTrigger: { trigger: section, start: OUT_START, end: OUT_END, scrub: true },
        })
      }
    }, section)

    return () => ctx.revert()
  }, [chapter.index, isFirst, isLast, mobile, reduced, revealed])

  return (
    <section
      ref={sectionRef}
      id={`chapter-${chapter.id}`}
      className={`chapter chapter--${chapter.align} chapter--${chapter.id}`}
      style={{ '--chapter-vh': mobile ? chapter.scrollVhMobile : chapter.scrollVh } as React.CSSProperties}
      aria-labelledby={titleId}
      data-chapter={chapter.index}
    >
      <div className="chapter__frame">
        <div className="chapter__inner">
          <div className="chapter__copy">
            <p className="eyebrow">
              <span className="type-num">{chapter.ordinal}</span>
              <span>{chapter.eyebrow}</span>
            </p>

            <SplitReveal
              as={isFirst ? 'h1' : 'h2'}
              by="word"
              text={chapter.headline}
              id={titleId}
              className={`chapter__headline ${isFirst ? 'type-mega' : 'type-display'}`}
              static={reduced}
            />

            {chapter.body && <p className="chapter__body type-lead">{chapter.body}</p>}

            {chapter.metrics && (
              <ul className="chapter__aside">
                {chapter.metrics.map((metric) => (
                  <li className="metric" key={metric.label}>
                    <span className="metric__value type-num">{metric.value}</span>
                    <span className="metric__label type-micro">{metric.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {chapter.slot && (
            <div className="chapter__slot">
              <ChapterSlot chapter={chapter} />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
