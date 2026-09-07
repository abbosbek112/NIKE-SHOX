import { useEffect, useState } from 'react'

/** Reactive media query hook. Returns `false` during the first paint on the server. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
export const MOBILE_QUERY = '(max-width: 860px)'
export const TOUCH_QUERY = '(hover: none), (pointer: coarse)'
export const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)'

export const useReducedMotion = () => useMediaQuery(REDUCED_MOTION_QUERY)
export const useIsMobile = () => useMediaQuery(MOBILE_QUERY)
export const useIsTouch = () => useMediaQuery(TOUCH_QUERY)
export const useHasFinePointer = () => useMediaQuery(FINE_POINTER_QUERY)

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

/**
 * Publishes the *stable* viewport height as `--vh-unit` so full-height sections
 * do not resize every time a mobile browser shows or hides its address bar.
 * Uses `100dvh` where available and falls back to a measured value.
 */
export function installViewportUnits(): () => void {
  if (typeof window === 'undefined') return () => {}

  const set = () => {
    const h = window.visualViewport?.height ?? window.innerHeight
    document.documentElement.style.setProperty('--vh-unit', `${h * 0.01}px`)
  }

  set()
  // Only react to *width* changes and orientation, not to address-bar scroll,
  // which is the classic cause of jumping layouts on iOS.
  let lastWidth = window.innerWidth
  const onResize = () => {
    if (Math.abs(window.innerWidth - lastWidth) < 1) return
    lastWidth = window.innerWidth
    set()
  }
  window.addEventListener('resize', onResize)
  window.addEventListener('orientationchange', set)
  return () => {
    window.removeEventListener('resize', onResize)
    window.removeEventListener('orientationchange', set)
  }
}
