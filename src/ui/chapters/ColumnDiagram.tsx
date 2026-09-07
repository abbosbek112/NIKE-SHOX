import { useEffect, useRef } from 'react'
import { MathUtils } from 'three'
import { PRODUCT_KEYS } from '@/config/timeline'
import { segmentAt } from '@/lib/math'
import { scroll } from '@/state/scroll'

/**
 * The column load diagram.
 *
 * Eleven marks, one per column on the visible side, that compress exactly when
 * the real column array compresses — both read the same `compress` value out of
 * `PRODUCT_KEYS`, so the diagram cannot drift out of step with the product no
 * matter how the timeline is re-authored.
 *
 * It writes one CSS variable on one element from a rAF loop. Routing a
 * per-frame number through React state here would re-render eleven nodes sixty
 * times a second to move some rectangles.
 */

/** Columns on the near side. The array is 22, mirrored. */
const COLUMNS = 11

/** Each column lags its neighbour slightly, so the load reads as a heel-to-toe roll. */
const LAG = 0.055

export function ColumnDiagram() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let shown = -1

    const tick = () => {
      const node = ref.current
      if (node) {
        const seg = segmentAt(PRODUCT_KEYS, scroll.smooth)
        const load = MathUtils.lerp(seg.a.compress, seg.b.compress, seg.e)
        // Two decimals is under a pixel of travel; skipping the write when it has
        // not changed keeps a parked page from touching style at all.
        const rounded = Math.round(load * 100) / 100
        if (rounded !== shown) {
          shown = rounded
          node.style.setProperty('--load', String(rounded))
        }
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="diagram" ref={ref} aria-hidden="true">
      <div className="diagram__plate diagram__plate--top" />
      <div className="diagram__columns">
        {Array.from({ length: COLUMNS }, (_, i) => (
          <span
            key={i}
            className="diagram__column"
            style={{ '--lag': String(i * LAG) } as React.CSSProperties}
          />
        ))}
      </div>
      <div className="diagram__plate diagram__plate--bottom" />
      <p className="diagram__caption type-micro">Load path · heel to forefoot</p>
    </div>
  )
}
