import { useCallback, useEffect, useRef, useState } from 'react'
import { scrollToChapter } from '@/animation/scroller'
import { PRODUCT, formatPrice } from '@/config/product'
import { useDialog } from '@/hooks/useDialog'
import { createCheckoutSession, isCheckoutConfigured, toCheckoutRequest } from '@/lib/checkout'
import { selectCartCount, selectSubtotal, useCart } from '@/state/useCart'
import { useExperience } from '@/state/useExperience'

/**
 * The bag.
 *
 * A real cart: lines persist to localStorage, quantities go up and down, and
 * checkout is honest — with no `VITE_CHECKOUT_ENDPOINT` configured it says so
 * instead of showing a fake confirmation.
 */
export function CartDrawer() {
  const open = useExperience((s) => s.cartOpen)
  const setCartOpen = useExperience((s) => s.setCartOpen)
  const items = useCart((s) => s.items)
  const setQuantity = useCart((s) => s.setQuantity)
  const remove = useCart((s) => s.remove)
  const subtotal = useCart(selectSubtotal)
  const count = useCart(selectCartCount)
  const panelRef = useRef<HTMLDivElement>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const close = useCallback(() => setCartOpen(false), [setCartOpen])
  useDialog(open, close, panelRef)

  // A message about the previous attempt should not be waiting here next time.
  useEffect(() => {
    if (!open) setNotice(null)
  }, [open])

  const onCheckout = async () => {
    setBusy(true)
    const result = await createCheckoutSession(toCheckoutRequest(items, PRODUCT.currency))
    setBusy(false)
    if (result.status === 'redirect') {
      window.location.href = result.url
      return
    }
    setNotice(result.message)
  }

  const onPickSize = () => {
    close()
    // The drawer's own focus restore has nowhere to go here: the button that was
    // clicked is inside the panel that just became `visibility: hidden`, so focus
    // would fall to <body> and a keyboard user would have to tab from the top of
    // the document. Hand it to the size row we just scrolled them to instead.
    window.setTimeout(() => {
      scrollToChapter('shop')
      const row = document.querySelector<HTMLElement>('#chapter-shop .sizes__row [role="radio"][tabindex="0"]')
      row?.focus({ preventScroll: true })
    }, 120)
  }

  const tab = open ? 0 : -1

  return (
    <div className={`drawer${open ? ' is-open' : ''}`}>
      <div className="drawer__scrim" onClick={close} aria-hidden="true" />

      <div
        className="drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Bag"
        aria-hidden={!open}
        ref={panelRef}
      >
        <div className="drawer__head">
          <p className="type-label">
            Bag <span className="type-num">{count}</span>
          </p>
          <button type="button" className="drawer__close" tabIndex={tab} data-cursor="open" onClick={close}>
            <span aria-hidden="true">Close</span>
            <span className="visually-hidden">Close bag</span>
          </button>
        </div>

        {items.length === 0 ? (
          <div className="drawer__empty">
            <p className="type-lead">Your bag is empty.</p>
            <button type="button" className="btn btn--ghost" tabIndex={tab} data-cursor="open" onClick={onPickSize}>
              <span>Pick a size</span>
            </button>
          </div>
        ) : (
          <ul className="drawer__list">
            {items.map((item) => (
              <li className="line" key={item.id}>
                <div className="line__body">
                  <p className="line__name type-label">{item.name}</p>
                  <p className="line__meta type-micro">
                    {item.colorwayName} · EU <span className="type-num">{item.size}</span>
                  </p>
                </div>

                <div className="line__qty" role="group" aria-label={`Quantity, ${item.colorwayName} EU ${item.size}`}>
                  <button
                    type="button"
                    className="line__step"
                    tabIndex={tab}
                    onClick={() => setQuantity(item.id, item.quantity - 1)}
                  >
                    <span aria-hidden="true">–</span>
                    <span className="visually-hidden">Decrease quantity</span>
                  </button>
                  <span className="line__count type-num" aria-live="polite">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    className="line__step"
                    tabIndex={tab}
                    disabled={item.quantity >= 9}
                    onClick={() => setQuantity(item.id, item.quantity + 1)}
                  >
                    <span aria-hidden="true">+</span>
                    <span className="visually-hidden">Increase quantity</span>
                  </button>
                </div>

                <p className="line__price type-num type-label">{formatPrice(item.price * item.quantity)}</p>

                <button type="button" className="line__remove type-micro" tabIndex={tab} onClick={() => remove(item.id)}>
                  <span aria-hidden="true">Remove</span>
                  <span className="visually-hidden">{`Remove ${item.colorwayName} EU ${item.size}`}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="drawer__foot">
          <div className="drawer__total">
            <span className="type-label">Subtotal</span>
            <span className="type-num type-h2">{formatPrice(subtotal)}</span>
          </div>

          <button
            type="button"
            className="btn btn--solid"
            tabIndex={tab}
            data-cursor="open"
            disabled={busy || items.length === 0}
            onClick={onCheckout}
          >
            <span>{busy ? 'Connecting…' : 'Checkout'}</span>
          </button>

          <p className="drawer__notice type-micro" role="status" aria-live="polite">
            {notice ??
              (isCheckoutConfigured()
                ? 'Taxes and shipping calculated at checkout.'
                : 'Demo build · no payment provider connected.')}
          </p>
        </div>
      </div>
    </div>
  )
}
