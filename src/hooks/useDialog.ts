import { useEffect, type RefObject } from 'react'
import { lockScroll, unlockScroll } from '@/animation/scroller'

/**
 * Modal behaviour for the three overlay panels: menu, bag, specification.
 *
 * Everything a `aria-modal="true"` element promises has to actually be true, so
 * this owns all four parts of it — move focus in, trap Tab, close on Escape,
 * return focus to whatever opened it — plus stopping the film scrolling behind
 * the panel.
 *
 * The panels stay mounted while closed so they can transition; they are made
 * unreachable with `aria-hidden` and `tabIndex={-1}` at the call site rather than
 * by unmounting.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useDialog(open: boolean, close: () => void, panel: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return
    const node = panel.current
    if (!node) return

    const restoreTo = document.activeElement as HTMLElement | null
    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))

    // Whatever is first inside the panel — a close button, a chapter link. If a
    // panel is somehow empty, focus the panel itself so the trap has an anchor.
    const first = focusables()[0]
    if (first) first.focus()
    else node.focus()

    lockScroll()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
        return
      }
      if (event.key !== 'Tab') return

      const items = focusables()
      if (items.length === 0) return
      const edge = event.shiftKey ? items[0] : items[items.length - 1]
      if (document.activeElement !== edge) return
      // Only the edges are handled; everything between them is the browser's job.
      event.preventDefault()
      ;(event.shiftKey ? items[items.length - 1] : items[0]).focus()
    }

    // Capture, so a panel inside another keydown handler still wins Escape.
    window.addEventListener('keydown', onKey, true)

    return () => {
      window.removeEventListener('keydown', onKey, true)
      unlockScroll()
      // Take focus back when the panel still holds it — but also when nothing
      // holds it. Removing the last line of the bag unmounts the button that was
      // focused, which drops focus to <body>; without the second case a keyboard
      // user would land at the top of the document instead of back on the opener.
      // Focus that moved somewhere real is left alone: clicking a nav button to
      // swap panels should not yank it backwards.
      const active = document.activeElement
      const adrift = !active || active === document.body
      if (restoreTo && (adrift || node.contains(active))) restoreTo.focus()
    }
  }, [open, close, panel])
}
