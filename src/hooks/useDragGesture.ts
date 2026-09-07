import { useEffect, type RefObject } from 'react'
import { dragBy, resetDrag, resetPointer, pointer, updatePointer } from '@/state/pointer'

/**
 * The inspect gesture — drag the sneaker, in the DOM.
 *
 * This is a plain pointer-event listener on the stage wrapper rather than an R3F
 * `onPointerDown` on the mesh, for two reasons. R3F would have to raycast 75k
 * triangles on every move to know whether the pointer is on the shoe, and the
 * gesture would die the moment the pointer left the silhouette mid-drag. A DOM
 * gesture with pointer capture keeps rotating while the hand wanders anywhere on
 * screen, which is how every product viewer worth using behaves.
 *
 * Touch is the interesting case: the same finger movement can mean "rotate" or
 * "scroll the page". The stage carries `touch-action: pan-y`, so the browser
 * keeps vertical panning and hands us horizontal movement; we then wait for the
 * finger to commit to an axis before claiming the gesture. A vertical swipe over
 * the shoe scrolls the page like everywhere else and never rotates anything.
 */

/** How far a touch travels before we decide what it meant. */
const AXIS_SLOP = 8
/** Horizontal has to beat vertical by this much to count as a rotate. */
const AXIS_BIAS = 1.2
/** Equivalent pixel nudge for one arrow-key press. */
const KEY_YAW = 38
const KEY_PITCH = 26

export function useDragGesture(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const node = ref.current
    if (!node) return

    let id = -1
    let claimed = false
    let lastX = 0
    let lastY = 0
    let lastT = 0

    const claim = (pointerId: number) => {
      claimed = true
      pointer.dragging = true
      pointer.dragMomentum = 0
      // Best-effort: a synthetic or already-released pointer will throw here and
      // the gesture still works, it just stops tracking when the pointer leaves.
      try {
        node.setPointerCapture(pointerId)
      } catch {
        /* no capture available */
      }
    }

    const release = () => {
      if (id === -1) return
      id = -1
      claimed = false
      // Momentum survives, so a flick keeps spinning; `advancePointer` decays it.
      pointer.dragging = false
    }

    const onDown = (event: PointerEvent) => {
      if (id !== -1) return
      if (event.pointerType === 'mouse' && event.button !== 0) return
      id = event.pointerId
      lastX = event.clientX
      lastY = event.clientY
      lastT = event.timeStamp
      updatePointer(event.clientX, event.clientY)
      // A mouse press on the stage is unambiguous. A touch is not, yet.
      if (event.pointerType === 'mouse') claim(event.pointerId)
    }

    const onMove = (event: PointerEvent) => {
      // Parallax wants every move, including the ones over the DOM overlay.
      updatePointer(event.clientX, event.clientY)
      if (event.pointerId !== id) return

      const dx = event.clientX - lastX
      const dy = event.clientY - lastY

      if (!claimed) {
        if (Math.abs(dx) < AXIS_SLOP && Math.abs(dy) < AXIS_SLOP) return
        if (Math.abs(dx) < Math.abs(dy) * AXIS_BIAS) {
          // Vertical won. Let the page have it.
          id = -1
          return
        }
        claim(event.pointerId)
      }

      // Momentum is a velocity, so the delta needs a real time base. Clamp the
      // floor: coalesced moves can report the same timestamp twice.
      const dt = Math.max((event.timeStamp - lastT) / 1000, 1 / 240)
      lastX = event.clientX
      lastY = event.clientY
      lastT = event.timeStamp
      dragBy(dx, dy, dt)
    }

    const onUp = (event: PointerEvent) => {
      if (event.pointerId === id) release()
    }

    const onLeave = () => resetPointer()

    /**
     * Keyboard inspection. Arrow keys nudge the shoe while the stage has focus,
     * which is the only way to look at the other side of it without a pointer.
     * `dt` of zero leaves momentum alone — a key press should not throw a flick.
     */
    const onKeyDown = (event: KeyboardEvent) => {
      let dx = 0
      let dy = 0
      if (event.key === 'ArrowLeft') dx = -KEY_YAW
      else if (event.key === 'ArrowRight') dx = KEY_YAW
      else if (event.key === 'ArrowUp') dy = -KEY_PITCH
      else if (event.key === 'ArrowDown') dy = KEY_PITCH
      else return
      // The stage is focused specifically to inspect the product, so the arrows
      // belong to the product here. Page keys (space, PgDn) still scroll.
      event.preventDefault()
      dragBy(dx, dy, 0)
    }

    node.addEventListener('pointerdown', onDown)
    node.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    document.addEventListener('pointerleave', onLeave)

    return () => {
      node.removeEventListener('pointerdown', onDown)
      node.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.removeEventListener('pointerleave', onLeave)
      resetDrag()
      resetPointer()
    }
  }, [ref])
}
