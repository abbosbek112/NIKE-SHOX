import { useEffect, useRef } from 'react'
import { damp } from '@/lib/math'
import { useHasFinePointer } from '@/lib/media'
import { pointer } from '@/state/pointer'
import { useExperience } from '@/state/useExperience'

/**
 * The desktop cursor: a dot at the pointer, a ring that trails it.
 *
 * Two rules keep it from being annoying. It never lags the *dot* — the thing you
 * aim with sits exactly under your hand — only the ring trails. And it only
 * grows a label when there is something to say: `DRAG` over the sneaker, `OPEN`
 * over anything carrying `data-cursor="open"`.
 *
 * Nothing here touches React state. Hover comes from one capturing
 * `pointerover` listener into a local variable, position from the pointer
 * singleton, and every visual change is a class or a transform written in the
 * rAF loop. Mounted only where the pointer is fine, so touch devices keep the
 * platform's own behaviour.
 */

const RING_LAMBDA = 14
const MAX_DT = 1 / 30

export function Cursor() {
  const fine = useHasFinePointer()
  const reduced = useExperience((s) => s.reducedMotion)
  const dotRef = useRef<HTMLSpanElement>(null)
  const ringRef = useRef<HTMLSpanElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!fine) return
    const root = rootRef.current
    const dot = dotRef.current
    const ring = ringRef.current
    const label = labelRef.current
    if (!root || !dot || !ring || !label) return

    // The native cursor goes away only once ours is definitely on screen.
    document.documentElement.classList.add('has-cursor')

    let hover = ''
    const readHover = (target: EventTarget | null) => {
      const el = target instanceof Element ? target.closest('[data-cursor]') : null
      hover = el?.getAttribute('data-cursor') ?? ''
    }
    // Capture phase: a stopped-propagation click handler somewhere in the tree
    // should not be able to strand the cursor in the wrong state.
    const onOver = (event: PointerEvent) => readHover(event.target)
    document.addEventListener('pointerover', onOver, true)

    let rx = pointer.x
    let ry = pointer.y
    let last = performance.now()
    // Not a state any real frame can produce, so the first frame always writes.
    let shownState = 'init'
    let raf = 0

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, MAX_DT)
      last = now

      const x = pointer.x
      const y = pointer.y
      if (reduced) {
        rx = x
        ry = y
      } else {
        rx = damp(rx, x, RING_LAMBDA, dt)
        ry = damp(ry, y, RING_LAMBDA, dt)
      }
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`

      // `open` wins over `drag`: a button sits on top of the stage, and what you
      // are about to click matters more than what is behind it.
      const state = hover === 'open' ? 'open' : pointer.overProduct || pointer.dragging ? 'drag' : ''
      const next = `${state}${pointer.dragging ? '+down' : ''}${pointer.inside ? '+in' : ''}`

      if (next !== shownState) {
        shownState = next
        root.classList.toggle('is-visible', pointer.inside)
        root.classList.toggle('is-open', state === 'open')
        root.classList.toggle('is-drag', state === 'drag')
        root.classList.toggle('is-down', pointer.dragging)
        label.textContent = state === 'open' ? 'OPEN' : state === 'drag' ? 'DRAG' : ''
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('pointerover', onOver, true)
      document.documentElement.classList.remove('has-cursor')
    }
  }, [fine, reduced])

  if (!fine) return null

  return (
    <div className="cursor" ref={rootRef} aria-hidden="true">
      <span className="cursor__ring" ref={ringRef}>
        <span className="cursor__label type-micro" ref={labelRef} />
      </span>
      <span className="cursor__dot" ref={dotRef} />
    </div>
  )
}
