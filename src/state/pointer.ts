import { clamp, damp } from '@/lib/math'

/**
 * Pointer singleton. Same reasoning as the scroll store: read every frame by the
 * camera rig and the custom cursor, so it must not live in React state.
 *
 * `nx`/`ny` are the raw normalised position (-1..1, origin at viewport centre).
 * `sx`/`sy` are damped and are what the camera parallax actually uses.
 */
export interface PointerState {
  x: number
  y: number
  nx: number
  ny: number
  sx: number
  sy: number
  /** True while a pointer is pressed down on the product. */
  dragging: boolean
  /** Accumulated horizontal drag, in radians, applied on top of the timeline rotation. */
  dragYaw: number
  /** Accumulated vertical drag, in radians, clamped so the shoe cannot flip. */
  dragPitch: number
  /** Yaw velocity so a flick keeps spinning briefly after release. */
  dragMomentum: number
  inside: boolean
  /** Set while the pointer is over the product mesh. */
  overProduct: boolean
}

export const pointer: PointerState = {
  x: 0,
  y: 0,
  nx: 0,
  ny: 0,
  sx: 0,
  sy: 0,
  dragging: false,
  dragYaw: 0,
  dragPitch: 0,
  dragMomentum: 0,
  inside: false,
  overProduct: false,
}

export const MAX_DRAG_PITCH = 0.42

export function updatePointer(clientX: number, clientY: number): void {
  pointer.x = clientX
  pointer.y = clientY
  pointer.nx = clamp((clientX / window.innerWidth) * 2 - 1, -1, 1)
  pointer.ny = clamp((clientY / window.innerHeight) * 2 - 1, -1, 1)
  pointer.inside = true
}

export function resetPointer(): void {
  pointer.nx = 0
  pointer.ny = 0
  pointer.inside = false
}

export function resetDrag(): void {
  pointer.dragYaw = 0
  pointer.dragPitch = 0
  pointer.dragMomentum = 0
  pointer.dragging = false
}

/** How fast a released flick runs out of energy. */
const MOMENTUM_DECAY = 3.2
/**
 * How fast the shoe drifts back to the angle the scroll timeline asked for.
 * Slow enough to inspect a detail, fast enough that the authored composition is
 * always what you actually see a moment later.
 */
const RETURN_YAW = 0.75
const RETURN_PITCH = 1.4

/**
 * Advance the per-frame pointer physics: parallax damping, flick momentum, and
 * the slow return of a user drag back to the timeline's own rotation.
 *
 * Called once per frame by the scene choreographer, before anything reads the
 * values, so every consumer sees the same state within a frame.
 */
export function advancePointer(dt: number, reduced: boolean): void {
  pointer.sx = damp(pointer.sx, pointer.inside && !reduced ? pointer.nx : 0, 4, dt)
  pointer.sy = damp(pointer.sy, pointer.inside && !reduced ? pointer.ny : 0, 4, dt)

  if (pointer.dragging) return

  if (pointer.dragMomentum !== 0) {
    pointer.dragYaw += pointer.dragMomentum * dt
    pointer.dragMomentum *= Math.exp(-MOMENTUM_DECAY * dt)
    if (Math.abs(pointer.dragMomentum) < 0.002) pointer.dragMomentum = 0
  }

  pointer.dragYaw = damp(pointer.dragYaw, 0, RETURN_YAW, dt)
  pointer.dragPitch = damp(pointer.dragPitch, 0, RETURN_PITCH, dt)
  if (Math.abs(pointer.dragYaw) < 1e-4) pointer.dragYaw = 0
  if (Math.abs(pointer.dragPitch) < 1e-4) pointer.dragPitch = 0
}

/** Feed a drag delta, in pixels, from whatever owns the gesture. */
export function dragBy(dx: number, dy: number, dt: number): void {
  const yaw = dx * 0.0068
  pointer.dragYaw += yaw
  pointer.dragPitch = clamp(pointer.dragPitch + dy * 0.0042, -MAX_DRAG_PITCH, MAX_DRAG_PITCH)
  // Momentum is a velocity, so it has to be per second, not per event.
  if (dt > 0) pointer.dragMomentum = clamp(yaw / dt, -9, 9)
}
