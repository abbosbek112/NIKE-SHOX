import { COLORWAYS } from '@/config/product'
import { useRadioKeys } from '@/hooks/useRadioKeys'
import { useExperience } from '@/state/useExperience'
import type { ColorwayId } from '@/types'

/**
 * Colourway selector.
 *
 * Selecting a finish does not swap an image: it re-targets every material zone
 * on the live product and the `ShoeMaterials` crossfade walks colour, roughness,
 * metalness, clearcoat and sheen to the new values over the next few frames. The
 * chrome colourway really does raise metalness on the columns and the rib cage.
 *
 * A radio group rather than a list of buttons, so arrow keys move between
 * finishes the way they do in every other single-choice control.
 */

export interface ColorwaySelectorProps {
  /** `rail` is the compact variant used inside the shop panel. */
  variant?: 'grid' | 'rail'
}

export function ColorwaySelector({ variant = 'grid' }: ColorwaySelectorProps) {
  const active = useExperience((s) => s.colorway)
  const setColorway = useExperience((s) => s.setColorway)
  const onKeyDown = useRadioKeys()

  const current = COLORWAYS.find((c) => c.id === active) ?? COLORWAYS[0]

  return (
    <div className={`swatches swatches--${variant}`}>
      <div className="swatches__row" role="radiogroup" aria-label="Colourway" onKeyDown={onKeyDown}>
        {COLORWAYS.map((colorway) => {
          const selected = colorway.id === active
          return (
            <button
              key={colorway.id}
              type="button"
              role="radio"
              aria-checked={selected}
              // Only the selected radio is tabbable; arrows move within the group.
              tabIndex={selected ? 0 : -1}
              className={`swatch${selected ? ' is-active' : ''}`}
              onClick={() => setColorway(colorway.id as ColorwayId)}
              title={colorway.name}
            >
              <span
                className="swatch__chip"
                aria-hidden="true"
                style={{ background: `linear-gradient(135deg, ${colorway.swatch[0]} 0%, ${colorway.swatch[1]} 100%)` }}
              />
              <span className="visually-hidden">{colorway.name}</span>
            </button>
          )
        })}
      </div>

      <p className="swatches__readout" aria-live="polite">
        <span className="swatches__name type-h3">{current.name}</span>
        <span className="swatches__code type-micro">{current.code}</span>
      </p>
    </div>
  )
}
