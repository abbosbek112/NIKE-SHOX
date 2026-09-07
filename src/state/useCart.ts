import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { CartItem, ColorwayId } from '@/types'
import { PRODUCT, colorwayById } from '@/config/product'

interface CartState {
  items: CartItem[]
  /** The size the shop panel currently has selected — not yet in the cart. */
  selectedSize: number | null
  /** Set after a successful add so the UI can confirm without a modal. */
  lastAdded: string | null

  selectSize: (eu: number | null) => void
  add: (colorwayId: ColorwayId, size: number) => CartItem
  remove: (id: string) => void
  setQuantity: (id: string, quantity: number) => void
  clear: () => void
  clearLastAdded: () => void
}

const lineId = (colorwayId: string, size: number) => `${PRODUCT.sku}-${colorwayId}-${size}`

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      selectedSize: null,
      lastAdded: null,

      selectSize: (selectedSize) => set({ selectedSize }),

      add: (colorwayId, size) => {
        const id = lineId(colorwayId, size)
        const existing = get().items.find((item) => item.id === id)
        const colorway = colorwayById(colorwayId)

        const next: CartItem = existing
          ? { ...existing, quantity: Math.min(existing.quantity + 1, 9) }
          : {
              id,
              sku: PRODUCT.sku,
              name: `${PRODUCT.brand} ${PRODUCT.name}`,
              colorwayId,
              colorwayName: colorway.name,
              size,
              price: PRODUCT.price,
              quantity: 1,
            }

        set({
          items: existing ? get().items.map((item) => (item.id === id ? next : item)) : [...get().items, next],
          lastAdded: id,
        })
        return next
      },

      remove: (id) => set({ items: get().items.filter((item) => item.id !== id) }),

      setQuantity: (id, quantity) =>
        set({
          items:
            quantity <= 0
              ? get().items.filter((item) => item.id !== id)
              : get().items.map((item) => (item.id === id ? { ...item, quantity: Math.min(quantity, 9) } : item)),
        }),

      clear: () => set({ items: [], lastAdded: null }),
      clearLastAdded: () => set({ lastAdded: null }),
    }),
    {
      name: 'shox.cart.v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items, selectedSize: state.selectedSize }) as CartState,
      version: 1,
    },
  ),
)

export const selectCartCount = (state: CartState): number =>
  state.items.reduce((total, item) => total + item.quantity, 0)

export const selectSubtotal = (state: CartState): number =>
  state.items.reduce((total, item) => total + item.price * item.quantity, 0)
