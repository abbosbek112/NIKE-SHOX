import { useCallback, useRef } from 'react'
import { PRODUCT, colorwayById } from '@/config/product'
import { useDialog } from '@/hooks/useDialog'
import { useExperience } from '@/state/useExperience'

/**
 * The specification overlay.
 *
 * The film says what the shoe feels like; this says what it is. It is a panel
 * rather than a chapter because specifications are reference material — you open
 * them when you want them and close them again, and they should not cost the
 * scroll another two viewport heights.
 */
export function SpecsPanel() {
  const open = useExperience((s) => s.specsOpen)
  const setSpecsOpen = useExperience((s) => s.setSpecsOpen)
  const colorwayId = useExperience((s) => s.colorway)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setSpecsOpen(false), [setSpecsOpen])
  useDialog(open, close, panelRef)

  const colorway = colorwayById(colorwayId)
  const tab = open ? 0 : -1

  return (
    <div className={`specs${open ? ' is-open' : ''}`}>
      <div className="specs__scrim" onClick={close} aria-hidden="true" />

      <div
        className="specs__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="specs-title"
        aria-hidden={!open}
        ref={panelRef}
      >
        <div className="specs__head">
          <p className="type-micro">Specification</p>
          <button type="button" className="specs__close" tabIndex={tab} data-cursor="open" onClick={close}>
            <span aria-hidden="true">Close</span>
            <span className="visually-hidden">Close specification</span>
          </button>
        </div>

        <h2 className="specs__title type-h2" id="specs-title">
          {PRODUCT.brand} {PRODUCT.name}
        </h2>
        <p className="specs__copy type-lead">{PRODUCT.description}</p>

        <dl className="specs__table">
          {PRODUCT.specs.map((row) => (
            <div className="specs__row" key={row.label}>
              <dt className="type-micro">{row.label}</dt>
              <dd className="type-label">{row.value}</dd>
            </div>
          ))}
          <div className="specs__row">
            <dt className="type-micro">Colourway</dt>
            <dd className="type-label">
              {colorway.name} · {colorway.code}
            </dd>
          </div>
          <div className="specs__row">
            <dt className="type-micro">Sizes</dt>
            <dd className="type-label type-num">
              {PRODUCT.sizes
                .filter((size) => size.available)
                .map((size) => size.eu)
                .join('  ')}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
