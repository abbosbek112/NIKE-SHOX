import { useEffect, useRef, useState } from 'react'
import { PRODUCT, colorwayById, formatPrice } from '@/config/product'
import { createCheckoutSession, isCheckoutConfigured, toCheckoutRequest } from '@/lib/checkout'
import { useCart } from '@/state/useCart'
import { useExperience } from '@/state/useExperience'
import { ColorwaySelector } from './ColorwaySelector'
import { SizeSelector } from './SizeSelector'

/**
 * The shop panel — the only place on the page that looks like commerce.
 *
 * It sits inside the final chapter's sticky frame, opposite the product, so the
 * transaction happens in the same shot as the hero rather than on a separate page.
 *
 * Checkout is honest: with no `VITE_CHECKOUT_ENDPOINT` configured, "Buy now" says
 * so in plain language instead of animating a fake success. Everything else —
 * size, colourway, quantity, the bag — is real state and really persists.
 */

/** How long the "added" confirmation stays up. */
const CONFIRM_MS = 2600

export function ProductPanel() {
  const setCartOpen = useExperience((s) => s.setCartOpen)
  const setSpecsOpen = useExperience((s) => s.setSpecsOpen)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  const flash = (message: string) => {
    setNotice(message)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setNotice(null), CONFIRM_MS)
  }

  const onAdd = () => {
    // Read the selection at click time, not from this render's closure. React
    // batches state updates, so a size change and an add that land in the same
    // tick would otherwise bag the previous size.
    const { selectedSize, add } = useCart.getState()
    const active = useExperience.getState().colorway
    if (selectedSize === null) {
      flash('Select a size first.')
      return
    }
    add(active, selectedSize)
    flash(`Added · ${colorwayById(active).name} · EU ${selectedSize}`)
  }

  const onBuy = async () => {
    const { selectedSize, add } = useCart.getState()
    const active = useExperience.getState().colorway
    if (selectedSize === null) {
      flash('Select a size first.')
      return
    }
    // Buying is adding, then trying to check out with the whole bag. Read the
    // lines back out of the store rather than from this render's closure, so the
    // request carries the quantity `add` just wrote.
    add(active, selectedSize)
    setBusy(true)
    const result = await createCheckoutSession(toCheckoutRequest(useCart.getState().items, PRODUCT.currency))
    setBusy(false)

    if (result.status === 'redirect') {
      window.location.href = result.url
      return
    }
    flash(result.message)
    setCartOpen(true)
  }

  return (
    <div className="panel">
      <div className="panel__head">
        <div>
          <p className="panel__name type-label">
            {PRODUCT.brand} {PRODUCT.name}
          </p>
          <p className="panel__price type-h2">
            <span className="type-num">{formatPrice(PRODUCT.price)}</span>
          </p>
        </div>
        <p className="panel__sku type-micro">{PRODUCT.sku}</p>
      </div>

      <ColorwaySelector variant="rail" />
      <SizeSelector />

      <div className="panel__actions">
        <button type="button" className="btn btn--solid" data-cursor="open" onClick={onAdd}>
          <span>Add to bag</span>
        </button>
        <button type="button" className="btn btn--ghost" data-cursor="open" onClick={onBuy} disabled={busy}>
          <span>{busy ? 'Connecting…' : 'Buy now'}</span>
        </button>
      </div>

      <p className="panel__notice type-micro" role="status" aria-live="polite">
        {notice ?? (isCheckoutConfigured() ? 'Secure checkout' : 'Demo build · no payment provider connected')}
      </p>

      <button type="button" className="panel__specs type-label" data-cursor="open" onClick={() => setSpecsOpen(true)}>
        <span>Full specification</span>
        <span aria-hidden="true">→</span>
      </button>
    </div>
  )
}
