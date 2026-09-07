/**
 * WebGL capability probe. Runs once, before the Canvas mounts, so a machine
 * without WebGL gets the DOM fallback instead of an empty black rectangle.
 */
export function detectWebGL(): { supported: boolean; version: 1 | 2 | 0; reason: string } {
  if (typeof window === 'undefined') return { supported: false, version: 0, reason: 'no window' }
  if (typeof WebGLRenderingContext === 'undefined') return { supported: false, version: 0, reason: 'WebGLRenderingContext missing' }

  let canvas: HTMLCanvasElement | null = null
  try {
    canvas = document.createElement('canvas')
    const attrs: WebGLContextAttributes = { failIfMajorPerformanceCaveat: false, powerPreference: 'high-performance' }
    const gl2 = canvas.getContext('webgl2', attrs)
    if (gl2) {
      gl2.getExtension('WEBGL_lose_context')?.loseContext()
      return { supported: true, version: 2, reason: 'webgl2' }
    }
    const gl1 = canvas.getContext('webgl', attrs) ?? canvas.getContext('experimental-webgl')
    if (gl1) {
      ;(gl1 as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext()
      return { supported: true, version: 1, reason: 'webgl1' }
    }
    return { supported: false, version: 0, reason: 'no context' }
  } catch (error) {
    return { supported: false, version: 0, reason: error instanceof Error ? error.message : 'unknown' }
  } finally {
    canvas = null
  }
}
