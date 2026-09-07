import { scrollToChapter } from '@/animation/scroller'

/**
 * The hero's only piece of interface.
 *
 * One button and one scroll cue. The button scrolls rather than navigating,
 * because there is nowhere to navigate to — the whole product is one scroll.
 */
export function HeroCta() {
  return (
    <div className="hero-cta">
      <button
        type="button"
        className="btn btn--solid"
        data-cursor="open"
        onClick={() => scrollToChapter('shape')}
      >
        <span>Explore Shox</span>
      </button>

      <p className="hero-cta__cue type-micro">
        <span aria-hidden="true" className="hero-cta__cue-rule" />
        Scroll to begin
      </p>
    </div>
  )
}
