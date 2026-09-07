import type { ChapterDef } from '@/types'
import { ColorwaySelector } from '@/ui/product/ColorwaySelector'
import { ProductPanel } from '@/ui/product/ProductPanel'
import { ColumnDiagram } from './ColumnDiagram'
import { DetailIndex } from './DetailIndex'
import { HeroCta } from './HeroCta'
import { Marquee } from './Marquee'

/**
 * Maps a chapter's `slot` to the interface that belongs in it.
 *
 * The chapter table decides which chapter gets which slot, so re-ordering the
 * film is a data edit. `Chapter` itself never learns what a colourway is.
 */
export function ChapterSlot({ chapter }: { chapter: ChapterDef }) {
  switch (chapter.slot) {
    case 'hero':
      return <HeroCta />
    case 'stats':
      return <ColumnDiagram />
    case 'detail-index':
      return <DetailIndex />
    case 'marquee':
      return <Marquee />
    case 'colorway':
      return <ColorwaySelector variant="grid" />
    case 'shop':
      return <ProductPanel />
    default:
      return null
  }
}
