import { useEffect, useRef, useState } from 'react'
import { scrollToChapter } from '@/animation/scroller'
import { CHAPTERS } from '@/config/chapters'
import { onChapterChange, scroll } from '@/state/scroll'
import { useExperience } from '@/state/useExperience'

/**
 * The chapter rail — where you are in the film, and how to get somewhere else.
 *
 * The fill is written straight to `style.transform` from a rAF loop, because it
 * moves on every frame; the active index comes through the chapter subscription,
 * because it changes seven times. Two different rates, two different mechanisms.
 */
export function ScrollRail() {
  const phase = useExperience((s) => s.phase)
  const fillRef = useRef<HTMLSpanElement>(null)
  const [active, setActive] = useState(scroll.chapter)

  useEffect(() => onChapterChange(setActive), [])

  useEffect(() => {
    let raf = 0
    let shown = -1
    const tick = () => {
      const node = fillRef.current
      if (node) {
        const p = Math.round(scroll.progress * 1000) / 1000
        if (p !== shown) {
          shown = p
          node.style.transform = `scaleY(${p})`
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const visible = phase === 'reveal' || phase === 'ready'

  return (
    <div className={`rail${visible ? ' is-visible' : ''}`}>
      <span className="rail__track" aria-hidden="true">
        <span className="rail__fill" ref={fillRef} />
      </span>

      <ol className="rail__list">
        {CHAPTERS.map((chapter) => (
          <li key={chapter.id}>
            <button
              type="button"
              className={`rail__dot${active === chapter.index ? ' is-active' : ''}`}
              data-cursor="open"
              aria-current={active === chapter.index ? 'true' : undefined}
              onClick={() => scrollToChapter(chapter.id)}
            >
              <span className="rail__dot-mark" aria-hidden="true" />
              <span className="rail__dot-label type-micro" aria-hidden="true">
                {chapter.navLabel}
              </span>
              <span className="visually-hidden">
                {`Chapter ${chapter.ordinal}, ${chapter.navLabel}`}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
