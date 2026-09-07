import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { degradeProfile } from '@/lib/perf'
import { useExperience } from '@/state/useExperience'

/**
 * The runtime half of the performance system.
 *
 * `detectPerfProfile()` guesses a tier from the GPU string, core count and
 * pointer type before a single frame has been drawn. That guess is right most of
 * the time and cheap when it is wrong in the conservative direction — but a
 * throttled laptop, a busy tab or an unrecognised mobile GPU can still leave a
 * "high" machine dropping frames, and the guess never gets a second look. This
 * watches the frames that actually shipped and steps the tier down when they are
 * bad enough for long enough.
 *
 * Two rules keep it from making things worse than the stutter it is fixing:
 *
 * - It only ever degrades, never upgrades. An oscillating quality level is more
 *   distracting than a permanently lower one, and each step costs a geometry
 *   rebuild and a shader recompile.
 * - A slow *and steady* frame rate is left alone. A 30 Hz display, or a scene
 *   whose GPU cost happens to sit just over one vsync interval, delivers frames
 *   like clockwork at 30 fps — smooth, and above the mobile target. Starvation
 *   worth acting on is jittery, because rAF keeps slipping between a one-frame
 *   and a two-frame budget, so jitter is the second half of the test.
 *
 * It owns its own `useFrame` rather than joining the choreographer's, which is
 * safe for the reason the choreographer's comment gives: this callback reads the
 * frame delta and nothing else. It touches no scene object, so no ordering
 * guarantee depends on where it runs.
 */

/** Frames per measurement window — about two seconds of a healthy 60 fps. */
const WINDOW = 120

/** Frames ignored after mount and after each step down, while the scene settles. */
const SETTLE = 90

/** Below this, and jittery, the window counts as a strike. */
const MIN_FPS = 46

/** Standard deviation of frame time, in ms, above which a slow window is jitter. */
const MIN_JITTER = 2.5

/** Consecutive bad windows before stepping down. */
const STRIKES = 2

/** A delta longer than this is a tab switch or a GC pause, not a slow frame. */
const OUTLIER = 0.25

export function PerfGuard() {
  const phase = useExperience((s) => s.phase)
  const tier = useExperience((s) => s.perf.tier)
  // Running sums, so a window costs two adds and no allocation.
  const win = useRef({ n: 0, sum: 0, sumSq: 0, strikes: 0, settle: SETTLE })

  useFrame((_, delta) => {
    // 'low' is the floor, and everything before 'ready' is boot cost, not frame cost.
    if (tier === 'low' || phase !== 'ready') return

    const w = win.current
    if (delta > OUTLIER) {
      w.n = 0
      w.sum = 0
      w.sumSq = 0
      return
    }
    if (w.settle > 0) {
      w.settle--
      return
    }

    const ms = delta * 1000
    w.n++
    w.sum += ms
    w.sumSq += ms * ms
    if (w.n < WINDOW) return

    const mean = w.sum / w.n
    const jitter = Math.sqrt(Math.max(w.sumSq / w.n - mean * mean, 0))
    const fps = 1000 / mean
    w.n = 0
    w.sum = 0
    w.sumSq = 0

    if (fps >= MIN_FPS || jitter <= MIN_JITTER) {
      w.strikes = 0
      return
    }
    if (++w.strikes < STRIKES) return

    w.strikes = 0
    w.settle = SETTLE
    const store = useExperience.getState()
    store.setPerf(degradeProfile(store.perf))
  })

  return null
}
