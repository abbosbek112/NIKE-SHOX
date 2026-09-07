import { useCallback, type KeyboardEvent } from 'react'

/**
 * Arrow-key navigation for a `role="radiogroup"`.
 *
 * Both product selectors use a roving tabindex, which is what the radio pattern
 * asks for — but a roving tabindex on its own leaves exactly one option reachable
 * from the keyboard, so without this the size and colourway can be seen but never
 * changed without a pointer.
 *
 * Focus moves, then the option it lands on is clicked, which leaves the decision
 * about whether the move also *selects* with each button's own handler: a
 * sold-out size takes focus and announces itself without changing the choice.
 */
export function useRadioKeys(): (event: KeyboardEvent<HTMLElement>) => void {
  return useCallback((event: KeyboardEvent<HTMLElement>) => {
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    const home = event.key === 'Home'
    const end = event.key === 'End'
    if (!back && !forward && !home && !end) return

    const radios = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'))
    if (radios.length === 0) return

    const from = radios.indexOf(document.activeElement as HTMLElement)
    let next = 0
    if (end) next = radios.length - 1
    else if (!home && from >= 0) next = (from + (forward ? 1 : -1) + radios.length) % radios.length

    // Arrows inside a radiogroup belong to the group, not to the page scroll.
    event.preventDefault()
    radios[next].focus()
    radios[next].click()
  }, [])
}
