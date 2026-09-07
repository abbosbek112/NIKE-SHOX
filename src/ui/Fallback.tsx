import { CHAPTERS } from '@/config/chapters'
import { PRODUCT } from '@/config/product'
import { ProductPanel } from '@/ui/product/ProductPanel'

/**
 * The no-WebGL product page.
 *
 * Shown when the browser cannot give us a WebGL context, or when the context is
 * lost and cannot be restored. It is not an apology screen: it carries the whole
 * story, the full specification, and a working shop panel, because the product
 * information has to survive the loss of the 3D scene.
 *
 * Plain flow layout, no sticky frames, no scroll choreography — the one thing
 * that has already failed is the thing this page must not depend on.
 */
export function Fallback() {
  return (
    <div className="fallback">
      <header className="fallback__hero">
        <p className="fallback__eyebrow type-micro">
          {PRODUCT.brand} · {PRODUCT.sku}
        </p>
        <h1 className="fallback__title type-mega">
          Nike
          <br />
          Shox
        </h1>
        <p className="fallback__sub type-lead">{PRODUCT.subtitle}</p>
        <p className="fallback__note type-micro">
          The interactive 3D presentation needs WebGL, which this browser or device did not provide. Everything
          about the shoe is below, and the bag works.
        </p>
      </header>

      <div className="fallback__body">
        <div className="fallback__story">
          {CHAPTERS.map((chapter) => (
            <section className="fallback__chapter" key={chapter.id} aria-labelledby={`fallback-${chapter.id}`}>
              <p className="fallback__ordinal type-micro">
                <span className="type-num">{chapter.ordinal}</span> {chapter.eyebrow}
              </p>
              <h2 className="fallback__headline type-h2" id={`fallback-${chapter.id}`}>
                {chapter.headline}
              </h2>
              {chapter.body && <p className="fallback__copy type-lead">{chapter.body}</p>}

              {chapter.metrics && (
                <ul className="fallback__metrics">
                  {chapter.metrics.map((metric) => (
                    <li key={metric.label}>
                      <span className="type-num type-h3">{metric.value}</span>
                      <span className="type-micro">{metric.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <section className="fallback__chapter" aria-labelledby="fallback-specs">
            <h2 className="fallback__headline type-h2" id="fallback-specs">
              Specification
            </h2>
            <p className="fallback__copy type-lead">{PRODUCT.description}</p>
            <dl className="fallback__specs">
              {PRODUCT.specs.map((row) => (
                <div key={row.label}>
                  <dt className="type-micro">{row.label}</dt>
                  <dd className="type-label">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <div className="fallback__shop" id="fallback-shop">
          <ProductPanel />
        </div>
      </div>
    </div>
  )
}
