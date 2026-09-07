import type { PerfProfile, PerfTier } from '@/types'

const PROFILES: Record<PerfTier, Omit<PerfProfile, 'reason'>> = {
  high: {
    tier: 'high',
    dpr: [1, 2],
    shadowMapSize: 2048,
    contactShadowRes: 1024,
    envResolution: 256,
    geometryDetail: 1,
    bloom: true,
    dof: true,
    grain: true,
    chromaticAberration: true,
    contactShadows: true,
    antialias: true,
  },
  medium: {
    tier: 'medium',
    dpr: [1, 1.5],
    shadowMapSize: 1024,
    contactShadowRes: 512,
    envResolution: 128,
    geometryDetail: 0.75,
    bloom: true,
    dof: false,
    grain: true,
    chromaticAberration: false,
    contactShadows: true,
    antialias: true,
  },
  low: {
    tier: 'low',
    dpr: [1, 1.35],
    shadowMapSize: 512,
    contactShadowRes: 256,
    envResolution: 64,
    geometryDetail: 0.5,
    bloom: true,
    dof: false,
    grain: false,
    chromaticAberration: false,
    contactShadows: false,
    antialias: false,
  },
}

const WEAK_GPU = /(mali-[t4-6]|adreno\s*[1-5][0-9]{2}|powervr|videocore|llvmpipe|swiftshader|software|apple gpu \(a[789]|intel.*(hd|uhd) graphics [2-6]?[0-9]{2}\b)/i
const STRONG_GPU = /(nvidia|geforce|rtx|radeon (rx|pro)|apple m[1-9]|adreno\s*(6[5-9][0-9]|7[0-9]{2}|8[0-9]{2})|mali-g[7-9][0-9]|intel.*arc)/i

function gpuString(): string {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return ''
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER))
    const lose = gl.getExtension('WEBGL_lose_context')
    lose?.loseContext()
    return renderer
  } catch {
    return ''
  }
}

export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 860px)').matches
}

export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(hover: none), (pointer: coarse)').matches
}

let cached: PerfProfile | null = null

/**
 * Pick a performance profile once, at boot. Deliberately conservative: a wrong
 * "high" guess costs the user a stuttering hero, a wrong "medium" guess costs
 * almost nothing visually.
 */
export function detectPerfProfile(): PerfProfile {
  if (cached) return cached
  if (typeof window === 'undefined') {
    cached = { ...PROFILES.medium, reason: 'no window' }
    return cached
  }

  const gpu = gpuString()
  const cores = navigator.hardwareConcurrency ?? 4
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  const coarse = isCoarsePointer()
  const smallScreen = Math.min(window.screen.width, window.screen.height) <= 480
  const dpr = window.devicePixelRatio || 1

  let score = 0
  if (STRONG_GPU.test(gpu)) score += 3
  if (WEAK_GPU.test(gpu)) score -= 4
  if (cores >= 8) score += 2
  else if (cores <= 4) score -= 1
  if (memory >= 8) score += 1
  else if (memory <= 4) score -= 2
  if (coarse) score -= 2
  if (smallScreen) score -= 1
  // A very high DPR on a phone means a lot of fragments for a modest GPU.
  if (coarse && dpr >= 3) score -= 1

  const tier: PerfTier = score >= 3 ? 'high' : score >= 0 ? 'medium' : 'low'
  cached = {
    ...PROFILES[tier],
    reason: `gpu="${gpu || 'unknown'}" cores=${cores} mem=${memory} coarse=${coarse} dpr=${dpr.toFixed(2)} score=${score}`,
  }
  return cached
}

/** Escape hatch used by the runtime performance monitor when frames are being dropped. */
export function degradeProfile(current: PerfProfile): PerfProfile {
  if (current.tier === 'low') return current
  const next: PerfTier = current.tier === 'high' ? 'medium' : 'low'
  return { ...PROFILES[next], reason: `${current.reason} → degraded from ${current.tier}` }
}
