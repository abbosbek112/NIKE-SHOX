import { useCallback, useRef } from 'react'
import { scrollToChapter } from '@/animation/scroller'
import { CHAPTERS } from '@/config/chapters'
import { PRODUCT, formatPrice } from '@/config/product'
import { useDialog } from '@/hooks/useDialog'
import { useExperience } from '@/state/useExperience'

/**
 * The mobile menu.
 *
 * A full-screen sheet listing every chapter, not just the four nav destinations:
 * on a phone the scroll is long, and being able to jump to "Materials" is worth
 * more than a tidy four-item list.
 *
 * Focus handling, Escape and the scroll lock all come from `useDialog`. It is a
 * dialog in behaviour, so it says so in markup.
 */
export function MobileMenu() {
  const open = useExperience((s) => s.menuOpen)
  const setMenuOpen = useExperience((s) => s.setMenuOpen)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setMenuOpen(false), [setMenuOpen])
  useDialog(open, close, panelRef)

  const go = (id: string) => {
    close()
    // Let the sheet start closing before the page moves under it.
    window.setTimeout(() => scrollToChapter(id), 120)
  }

  return (
    <div
      id="mobile-menu"
      className={`sheet${open ? ' is-open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      aria-hidden={!open}
      ref={panelRef}
    >
      <ul className="sheet__list">
        {CHAPTERS.map((chapter) => (
          <li key={chapter.id}>
            <button type="button" className="sheet__item" tabIndex={open ? 0 : -1} onClick={() => go(chapter.id)}>
              <span className="sheet__ordinal type-num type-micro">{chapter.ordinal}</span>
              <span className="sheet__label type-h2">{chapter.navLabel}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="sheet__foot">
        <p className="type-label">
          {PRODUCT.brand} {PRODUCT.name}
        </p>
        <p className="type-num type-label">{formatPrice(PRODUCT.price)}</p>
      </div>
    </div>
  )
}
