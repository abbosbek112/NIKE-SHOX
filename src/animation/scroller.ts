import type Lenis from 'lenis'

/**
 * The one handle on the scroller.
 *
 * `ScrollProvider` owns the Lenis instance; anything that needs to *move* the
 * page (nav, hero CTA, the scroll rail) needs that instance without importing
 * the provider and dragging React into a plain function. Registering the handle
 * here keeps the dependency one-way: the provider writes, everyone else reads.
 *
 * Targets are DOM elements rather than computed offsets. A chapter's top is
 * whatever the layout says it is, and Lenis measures it at call time — a number
 * derived from the chapter table would be one CSS change away from being wrong.
 */

let scroller: Lenis | null = null

export function registerScroller(next: Lenis | null): void {
  scroller = next
}

/** Duration in seconds. Long enough to read as a camera move, not a jump. */
const DURATION = 1.5

export function scrollToChapter(id: string): void {
  const target = document.getElementById(`chapter-${id}`)
  if (!target) return
  if (scroller) scroller.scrollTo(target, { duration: DURATION, lock: true })
  else target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function scrollToTop(): void {
  if (scroller) scroller.scrollTo(0, { duration: DURATION, lock: true })
  else window.scrollTo({ top: 0, behavior: 'smooth' })
}

/**
 * Scroll locking for the overlay panels.
 *
 * Counted, because two panels can be mid-transition in the same commit and React
 * runs every cleanup before every effect — an uncounted lock would let the first
 * panel's teardown release the page while the second one is still open.
 *
 * Without Lenis (reduced motion, or before the provider mounts) it falls back to
 * a class on the root element that `base.css` turns into `overflow: hidden`.
 */
let locks = 0

export function lockScroll(): void {
  locks += 1
  if (locks !== 1) return
  if (scroller) scroller.stop()
  else document.documentElement.classList.add('is-locked')
}

export function unlockScroll(): void {
  locks = Math.max(0, locks - 1)
  if (locks !== 0) return
  if (scroller) scroller.start()
  document.documentElement.classList.remove('is-locked')
}
