import { useEffect, useState } from 'react'
import { scrollToChapter, scrollToTop } from '@/animation/scroller'
import { CHAPTERS, NAV_SECTIONS } from '@/config/chapters'
import { onChapterChange, scroll } from '@/state/scroll'
import { selectCartCount, useCart } from '@/state/useCart'
import { useExperience } from '@/state/useExperience'

/**
 * The header.
 *
 * Four destinations and a bag, over a hairline that only appears once you have
 * left the hero — a rule across the top of a full-bleed cinematic frame is the
 * fastest way to make it look like a web page instead of a shot.
 *
 * The active destination is driven by the scroll singleton's chapter change
 * subscription rather than by a per-frame read, so this component re-renders a
 * handful of times over the whole page instead of sixty times a second.
 */
export function Nav() {
  const menuOpen = useExperience((s) => s.menuOpen)
  const setMenuOpen = useExperience((s) => s.setMenuOpen)
  const setCartOpen = useExperience((s) => s.setCartOpen)
  const phase = useExperience((s) => s.phase)
  const count = useCart(selectCartCount)
  const [chapter, setChapter] = useState(scroll.chapter)

  useEffect(() => onChapterChange(setChapter), [])

  const activeSection = CHAPTERS[chapter]?.navSection ?? null
  const visible = phase === 'reveal' || phase === 'ready' || phase === 'fallback'

  return (
    <header
      className={`nav${visible ? ' is-visible' : ''}${chapter > 0 ? ' is-lifted' : ''}${menuOpen ? ' is-raised' : ''}`}
    >
      <a
        className="nav__mark"
        href="#chapter-intro"
        data-cursor="open"
        onClick={(event) => {
          event.preventDefault()
          scrollToTop()
        }}
      >
        <span className="nav__mark-brand type-label">Nike</span>
        <span className="nav__mark-name type-label">Shox</span>
      </a>

      <nav className="nav__links" aria-label="Sections">
        <ul>
          {NAV_SECTIONS.map((section) => (
            <li key={section.id}>
              <button
                type="button"
                className={`nav__link type-label${activeSection === section.id ? ' is-active' : ''}`}
                data-cursor="open"
                aria-current={activeSection === section.id ? 'true' : undefined}
                onClick={() => scrollToChapter(CHAPTERS[section.chapter].id)}
              >
                <span className="nav__link-ordinal type-num">{section.ordinal}</span>
                <span>{section.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="nav__end">
        <button
          type="button"
          className="nav__cart type-label"
          data-cursor="open"
          onClick={() => setCartOpen(true)}
        >
          <span>Cart</span>
          {/* A red badge reading "0" says "you have something" and then contradicts
              itself, so the count only appears once there is one. The line below
              still tells assistive tech the bag is empty. */}
          {count > 0 && (
            <span className="nav__cart-count type-num" aria-hidden="true">
              {count}
            </span>
          )}
          <span className="visually-hidden">{count === 1 ? '1 item in bag' : `${count} items in bag`}</span>
        </button>

        <button
          type="button"
          className={`nav__burger${menuOpen ? ' is-open' : ''}`}
          data-cursor="open"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span className="visually-hidden">{menuOpen ? 'Close menu' : 'Open menu'}</span>
          <span className="nav__burger-bar" aria-hidden="true" />
          <span className="nav__burger-bar" aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
