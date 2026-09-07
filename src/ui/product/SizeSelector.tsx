import { PRODUCT } from '@/config/product'
import { useRadioKeys } from '@/hooks/useRadioKeys'
import { useCart } from '@/state/useCart'

/**
 * Size selector.
 *
 * Unavailable sizes stay visible and are marked `aria-disabled` rather than being
 * hidden: "EU 45 is sold out" is product information, and removing the button
 * would silently renumber the row. They remain focusable so a keyboard user can
 * discover the state instead of tabbing past a gap.
 */
export function SizeSelector() {
  const selected = useCart((s) => s.selectedSize)
  const selectSize = useCart((s) => s.selectSize)
  const onKeyDown = useRadioKeys()

  return (
    <div className="sizes">
      <div className="sizes__head">
        <span className="type-label">Size · EU</span>
        <span className="sizes__hint type-micro">True to size</span>
      </div>

      <div className="sizes__row" role="radiogroup" aria-label="Size, EU" onKeyDown={onKeyDown}>
        {PRODUCT.sizes.map((size) => {
          const active = selected === size.eu
          return (
            <button
              key={size.eu}
              type="button"
              role="radio"
              aria-checked={active}
              aria-disabled={!size.available}
              tabIndex={active || (selected === null && size.eu === PRODUCT.sizes[0].eu) ? 0 : -1}
              className={`size${active ? ' is-active' : ''}${size.available ? '' : ' is-out'}`}
              onClick={() => size.available && selectSize(active ? null : size.eu)}
            >
              <span className="type-num">{size.eu}</span>
              <span className="visually-hidden">
                {` EU ${size.eu}, US ${size.us}${size.available ? '' : ', sold out'}`}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
