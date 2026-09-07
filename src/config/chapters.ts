import type { ChapterDef, ChapterRange } from '@/types'

/**
 * The seven chapters, in scroll order.
 *
 * A chapter owns a slice of the page's total scroll height and a slice of the
 * normalised progress value every 3D timeline is sampled by. Copy, layout and
 * choreography are all keyed off this one table so a chapter can be re-timed by
 * changing a single number.
 *
 * Mobile heights are shorter: the same beat needs less travel when the viewport
 * is tall and narrow, and long scroll distances feel like work on a phone.
 */
export const CHAPTERS: readonly ChapterDef[] = [
  {
    index: 0,
    id: 'intro',
    ordinal: '01',
    navLabel: 'Intro',
    navSection: 'story',
    scrollVh: 130,
    scrollVhMobile: 120,
    eyebrow: 'Nike Shox TL',
    headline: 'Nike Shox',
    body: 'Engineered for impact.',
    align: 'center',
    slot: 'hero',
  },
  {
    index: 1,
    id: 'shape',
    ordinal: '02',
    navLabel: 'The Shape',
    navSection: 'story',
    scrollVh: 180,
    scrollVhMobile: 150,
    eyebrow: 'Silhouette',
    headline: 'Built to stand out.',
    body: 'A rib cage of glossy TPU over engineered mesh, drawn tight around a last that leans forward before you do. Every line is a load path.',
    // Centred, not side-by-side. This is the one chapter whose subject is the
    // whole silhouette, and a broadside 2.62-unit shoe fills ~88% of the frame at
    // any distance that still reads as "closer than the hero" — so there is no
    // column beside it to put copy in. The camera drops the product into the lower
    // two thirds instead, and the headline takes the band above it.
    align: 'center',
    metrics: [
      { value: '10 mm', label: 'Heel-to-toe offset' },
      { value: '397 g', label: 'Weight · EU 42' },
    ],
  },
  {
    index: 2,
    id: 'columns',
    ordinal: '03',
    navLabel: 'Shox Columns',
    navSection: 'technology',
    scrollVh: 220,
    scrollVhMobile: 180,
    eyebrow: 'Cushioning',
    headline: 'Twenty-two springs.',
    body: 'Polyurethane columns stand between two moulded plates. Landing compresses them; the plates spread the load across the whole array, and the columns give the energy straight back.',
    align: 'right',
    slot: 'stats',
    metrics: [
      { value: '22', label: 'Columns · 11 per side' },
      { value: '2', label: 'TPU stability plates' },
      { value: '18%', label: 'Peak compression' },
    ],
  },
  {
    index: 3,
    id: 'material',
    ordinal: '04',
    navLabel: 'Materials',
    navSection: 'details',
    scrollVh: 200,
    scrollVhMobile: 170,
    eyebrow: 'Construction',
    headline: 'Every surface, considered.',
    body: 'Matte woven mesh against mirror-finish TPU. A patent heel counter that catches one hard highlight. Foam that reads soft even before you touch it. Four materials, one family of light.',
    align: 'left',
    slot: 'detail-index',
  },
  {
    index: 4,
    id: 'movement',
    ordinal: '05',
    navLabel: 'Movement',
    navSection: 'details',
    scrollVh: 190,
    scrollVhMobile: 160,
    eyebrow: 'In motion',
    headline: 'Built to move.',
    body: 'Load, compress, return. The column array does the same thing every step, several thousand times a day.',
    align: 'center',
    slot: 'marquee',
  },
  {
    index: 5,
    id: 'color',
    ordinal: '06',
    navLabel: 'Colourways',
    navSection: 'shop',
    scrollVh: 200,
    scrollVhMobile: 180,
    eyebrow: 'Four finishes',
    headline: 'Choose your finish.',
    body: 'The same shoe in four materials. Switching a colourway re-finishes the surfaces in place — the metal actually becomes metal.',
    align: 'right',
    slot: 'colorway',
  },
  {
    index: 6,
    id: 'shop',
    ordinal: '07',
    navLabel: 'Shop',
    navSection: 'shop',
    scrollVh: 170,
    scrollVhMobile: 160,
    eyebrow: 'Nike Shox TL',
    headline: 'Nike Shox',
    body: 'Built for impact.',
    align: 'split',
    slot: 'shop',
  },
]

/** Nav destinations, in the order the user asked for. */
export const NAV_SECTIONS: readonly { id: 'story' | 'technology' | 'details' | 'shop'; ordinal: string; label: string; chapter: number }[] = [
  { id: 'story', ordinal: '01', label: 'Story', chapter: 1 },
  { id: 'technology', ordinal: '02', label: 'Technology', chapter: 2 },
  { id: 'details', ordinal: '03', label: 'Details', chapter: 3 },
  { id: 'shop', ordinal: '04', label: 'Shop', chapter: 6 },
]

const totalVh = (mobile: boolean): number =>
  CHAPTERS.reduce((sum, c) => sum + (mobile ? c.scrollVhMobile : c.scrollVh), 0)

/**
 * Normalised progress boundaries per chapter. Every 3D timeline keyframe is
 * authored against these, so re-timing a chapter automatically re-times the
 * camera, lighting and post-processing that belong to it.
 */
export function chapterRanges(mobile = false): ChapterRange[] {
  const total = totalVh(mobile)
  let cursor = 0
  return CHAPTERS.map((chapter) => {
    const height = mobile ? chapter.scrollVhMobile : chapter.scrollVh
    const start = cursor / total
    cursor += height
    return { index: chapter.index, id: chapter.id, start, end: cursor / total }
  })
}

export const CHAPTER_RANGES = chapterRanges(false)
export const CHAPTER_RANGES_MOBILE = chapterRanges(true)

/** Progress at the centre of a chapter — handy when authoring keyframes. */
export const chapterMid = (index: number, mobile = false): number => {
  const range = (mobile ? CHAPTER_RANGES_MOBILE : CHAPTER_RANGES)[index]
  return (range.start + range.end) / 2
}

export const chapterAt = (progress: number, mobile = false): number => {
  const ranges = mobile ? CHAPTER_RANGES_MOBILE : CHAPTER_RANGES
  for (let i = ranges.length - 1; i >= 0; i--) if (progress >= ranges[i].start) return i
  return 0
}

export const TOTAL_VH = totalVh(false)
export const TOTAL_VH_MOBILE = totalVh(true)
