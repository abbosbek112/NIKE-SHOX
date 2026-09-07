/**
 * Masked type reveal.
 *
 * Pure markup — no animation lives here. Each unit sits inside an
 * `overflow: hidden` line box so a parent GSAP timeline can slide
 * `.reveal-line > span` up from below the mask (see `styles/typography.css`).
 * Keeping the animation out of this component is what lets the same markup be
 * driven by a one-shot hero timeline, a scrubbed chapter trigger, or nothing at
 * all under `prefers-reduced-motion`.
 *
 * Accessibility: the visible fragments are `aria-hidden` and the whole phrase is
 * republished as one `aria-label`, so a screen reader reads "Built to stand out."
 * rather than four disconnected words.
 */

/**
 * The tags this is ever rendered as. Deliberately a small union rather than
 * `ElementType`: the wide type resolves the intersection of every possible
 * element's props, which collapses `children` to `never`.
 */
export type RevealTag = 'span' | 'p' | 'h1' | 'h2' | 'h3'

export interface SplitRevealProps {
  text: string
  /** `word` cascades across a headline; `line` treats the string as one unit. */
  by?: 'word' | 'line'
  as?: RevealTag
  className?: string
  /** Skip the mask entirely — used when reduced motion is preferred. */
  static?: boolean
  /** For `aria-labelledby` on the surrounding section. */
  id?: string
}

export function SplitReveal({
  text,
  by = 'line',
  as: Tag = 'span',
  className = '',
  static: isStatic = false,
  id,
}: SplitRevealProps) {
  const units = by === 'word' ? text.split(/\s+/).filter(Boolean) : text.split('\n')

  return (
    <Tag
      id={id}
      className={['reveal', by === 'word' ? 'reveal--words' : '', isStatic ? 'is-static' : '', className]
        .filter(Boolean)
        .join(' ')}
      aria-label={text}
    >
      {units.map((unit, i) => (
        <span className="reveal-line" key={`${i}-${unit}`}>
          <span aria-hidden="true">{unit}</span>
        </span>
      ))}
    </Tag>
  )
}

/** The animated targets inside a `SplitReveal`, for GSAP to pick up. */
export const REVEAL_TARGET = '.reveal-line > span'
