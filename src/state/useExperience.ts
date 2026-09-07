import { create } from 'zustand'
import type { ColorwayId, ExperiencePhase, PerfProfile } from '@/types'
import { DEFAULT_COLORWAY } from '@/config/product'
import { detectPerfProfile } from '@/lib/perf'
import { prefersReducedMotion } from '@/lib/media'

interface ExperienceState {
  phase: ExperiencePhase
  /** 0..1 asset + warmup progress shown by the loader. */
  loadProgress: number
  colorway: ColorwayId
  activeChapter: number
  menuOpen: boolean
  cartOpen: boolean
  specsOpen: boolean
  perf: PerfProfile
  reducedMotion: boolean
  /** Set when WebGL is unavailable or the context is lost. */
  webglFailed: boolean

  setPhase: (phase: ExperiencePhase) => void
  setLoadProgress: (value: number) => void
  setColorway: (id: ColorwayId) => void
  setActiveChapter: (index: number) => void
  setMenuOpen: (open: boolean) => void
  setCartOpen: (open: boolean) => void
  setSpecsOpen: (open: boolean) => void
  setPerf: (perf: PerfProfile) => void
  setReducedMotion: (value: boolean) => void
  failWebGL: () => void
}

export const useExperience = create<ExperienceState>((set) => ({
  phase: 'boot',
  loadProgress: 0,
  colorway: DEFAULT_COLORWAY,
  activeChapter: 0,
  menuOpen: false,
  cartOpen: false,
  specsOpen: false,
  perf: detectPerfProfile(),
  reducedMotion: prefersReducedMotion(),
  webglFailed: false,

  setPhase: (phase) => set({ phase }),
  setLoadProgress: (loadProgress) => set({ loadProgress }),
  setColorway: (colorway) => set({ colorway }),
  setActiveChapter: (activeChapter) => set({ activeChapter }),
  // Opening one overlay closes the other — they occupy the same visual slot.
  setMenuOpen: (menuOpen) => set(menuOpen ? { menuOpen, cartOpen: false } : { menuOpen }),
  setCartOpen: (cartOpen) => set(cartOpen ? { cartOpen, menuOpen: false } : { cartOpen }),
  setSpecsOpen: (specsOpen) => set({ specsOpen }),
  setPerf: (perf) => set({ perf }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  failWebGL: () => set({ webglFailed: true, phase: 'fallback' }),
}))
