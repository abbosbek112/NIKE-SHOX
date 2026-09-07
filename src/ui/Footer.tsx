import { scrollToTop } from '@/animation/scroller'
import { PRODUCT, formatPrice } from '@/config/product'

/**
 * The closing block, after the film.
 *
 * It sits in normal flow below the 1290vh of chapters, and it is opaque: the
 * canvas is `position: fixed`, so anything translucent here would show the 3D
 * scene sliding underneath and break the illusion that the film has ended.
 *
 * Nothing here animates on scroll. After thirteen viewport-heights of
 * choreography the right closing gesture is to stop moving.
 */

const LINKS: ReadonlyArray<{ heading: string; items: readonly string[] }> = [
  { heading: 'Shox', items: ['Overview', 'Technology', 'Sizing', 'Care'] },
  { heading: 'Support', items: ['Shipping', 'Returns', 'Contact'] },
  { heading: 'More', items: ['Store locator', 'Gift cards', 'Newsletter'] },
]

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer__top">
        <button type="button" className="footer__mark" data-cursor="open" onClick={() => scrollToTop()}>
          <span className="footer__mark-line type-display">Shox</span>
          <span className="footer__mark-cue type-micro">Back to the top</span>
        </button>

        <p className="footer__line type-lead">
          {PRODUCT.subtitle} {formatPrice(PRODUCT.price)}, in four colourways.
        </p>
      </div>

      <div className="footer__grid">
        {LINKS.map((column) => (
          <nav className="footer__col" key={column.heading} aria-label={column.heading}>
            <p className="footer__heading type-micro">{column.heading}</p>
            <ul>
              {column.items.map((item) => (
                <li key={item}>
                  {/* Demo build: these have nowhere to go, so they are text, not
                      links that lie about being navigable. */}
                  <span className="footer__item type-label">{item}</span>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div className="footer__col footer__col--note">
          <p className="footer__heading type-micro">About this build</p>
          <p className="footer__note type-micro">
            An independent, original web experience built to explore scroll-driven 3D product
            storytelling. Not affiliated with, endorsed by, or produced for Nike. The sneaker is
            procedural geometry authored for this project.
          </p>
        </div>
      </div>

      <div className="footer__base">
        <p className="type-micro">
          {PRODUCT.brand} {PRODUCT.name} · {PRODUCT.sku}
        </p>
        <p className="type-micro">Built with React, Three.js and GSAP</p>
      </div>
    </footer>
  )
}
