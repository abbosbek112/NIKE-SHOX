import type { CartItem } from '@/types'

/**
 * Checkout boundary.
 *
 * There is no payment provider wired to this build, and this module deliberately
 * never pretends otherwise — it returns `not-configured` instead of a fake
 * success. To go live, set `VITE_CHECKOUT_ENDPOINT` to an endpoint that creates a
 * provider session and responds with `{ "url": "https://..." }`; nothing else in
 * the UI needs to change.
 */

export interface CheckoutLine {
  sku: string
  colorwayId: string
  size: number
  quantity: number
  unitPrice: number
}

export interface CheckoutRequest {
  lines: CheckoutLine[]
  currency: string
  subtotal: number
}

export type CheckoutResult =
  | { status: 'not-configured'; message: string }
  | { status: 'empty'; message: string }
  | { status: 'redirect'; url: string }
  | { status: 'error'; message: string }

const ENDPOINT: string | undefined = import.meta.env.VITE_CHECKOUT_ENDPOINT

export const isCheckoutConfigured = (): boolean => typeof ENDPOINT === 'string' && ENDPOINT.length > 0

export function toCheckoutRequest(items: readonly CartItem[], currency: string): CheckoutRequest {
  return {
    lines: items.map((item) => ({
      sku: item.sku,
      colorwayId: item.colorwayId,
      size: item.size,
      quantity: item.quantity,
      unitPrice: item.price,
    })),
    currency,
    subtotal: items.reduce((total, item) => total + item.price * item.quantity, 0),
  }
}

export async function createCheckoutSession(request: CheckoutRequest): Promise<CheckoutResult> {
  if (request.lines.length === 0) {
    return { status: 'empty', message: 'Your bag is empty.' }
  }

  if (!isCheckoutConfigured()) {
    return {
      status: 'not-configured',
      message: 'Checkout is not connected in this build. No payment provider is configured.',
    }
  }

  try {
    const response = await fetch(ENDPOINT as string, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      return { status: 'error', message: `Checkout service responded ${response.status}.` }
    }

    const data: unknown = await response.json()
    const url = typeof data === 'object' && data !== null ? (data as { url?: unknown }).url : undefined
    if (typeof url !== 'string' || url.length === 0) {
      return { status: 'error', message: 'Checkout service did not return a session URL.' }
    }
    return { status: 'redirect', url }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Checkout request failed.' }
  }
}
