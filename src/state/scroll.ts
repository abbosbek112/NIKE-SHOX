import type { ChapterRange } from '@/types'
import { clamp, invLerp } from '@/lib/math'

/**
 * The single source of truth for scroll position.
 *
 * Deliberately a plain mutable object rather than React state: the 3D scene
 * reads it every frame inside `useFrame`, and routing that through React would
 * mean a re-render per frame. React-visible facts (which chapter is active) are
 * pushed out through the `onChapterChange` subscription instead, which fires a
 * handful of times over the whole page.
 */
export interface ScrollState {
  /** Raw normalised document progress, 0..1. */
  progress: number
  /** Progress after Lenis smoothing — what the camera actually follows. */
  smooth: number
  /** Signed scroll delta in pixels for the last frame. */
  velocity: number
  /** Velocity normalised to roughly -1..1 and smoothed, for kinetic effects. */
  kinetic: number
  /** Index into the chapter table. */
  chapter: number
  /** 0..1 within the active chapter. */
  chapterProgress: number
  y: number
  limit: number
  direction: 1 | -1
  /** True once the intro reveal has handed control to the user. */
  active: boolean
}

export const scroll: ScrollState = {
  progress: 0,
  smooth: 0,
  velocity: 0,
  kinetic: 0,
  chapter: 0,
  chapterProgress: 0,
  y: 0,
  limit: 1,
  direction: 1,
  active: false,
}

let ranges: readonly ChapterRange[] = []
const chapterListeners = new Set<(index: number) => void>()

export function setChapterRanges(next: readonly ChapterRange[]): void {
  ranges = next
}

export function getChapterRanges(): readonly ChapterRange[] {
  return ranges
}

export function onChapterChange(fn: (index: number) => void): () => void {
  chapterListeners.add(fn)
  return () => chapterListeners.delete(fn)
}

function resolveChapter(p: number): number {
  for (let i = 0; i < ranges.length; i++) {
    if (p < ranges[i].end || i === ranges.length - 1) return i
  }
  return 0
}

/** Called once per Lenis tick from ScrollProvider. */
export function updateScroll(y: number, limit: number, velocity: number): void {
  const safeLimit = Math.max(1, limit)
  const p = clamp(y / safeLimit)

  scroll.y = y
  scroll.limit = safeLimit
  scroll.progress = p
  scroll.smooth = p
  scroll.velocity = velocity
  scroll.direction = velocity >= 0 ? 1 : -1
  // 40px/frame is roughly a hard flick; clamp so a trackpad slam does not blow out effects.
  const target = clamp(velocity / 40, -1, 1)
  scroll.kinetic += (target - scroll.kinetic) * 0.12

  const chapter = resolveChapter(p)
  const range = ranges[chapter]
  scroll.chapterProgress = range ? invLerp(range.start, range.end, p) : 0

  if (chapter !== scroll.chapter) {
    scroll.chapter = chapter
    chapterListeners.forEach((fn) => fn(chapter))
  }
}

export function resetScroll(): void {
  scroll.progress = 0
  scroll.smooth = 0
  scroll.velocity = 0
  scroll.kinetic = 0
  scroll.chapter = 0
  scroll.chapterProgress = 0
  scroll.y = 0
  scroll.direction = 1
}
