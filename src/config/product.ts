import type { Colorway, MaterialZone, ProductSpec, SurfaceSpec } from '@/types'

/**
 * Surface archetypes. A colorway only has to say *what colour* each zone is —
 * the physical response (how rough, how glossy, whether it has a clearcoat)
 * belongs to the material, not the colourway, so every variant stays
 * believable under the same studio rig.
 */
const MESH = (color: string): SurfaceSpec => ({ color, roughness: 0.86, metalness: 0.02, sheen: 0.32, sheenColor: '#ffffff' })
const GLOSS_TPU = (color: string): SurfaceSpec => ({ color, roughness: 0.12, metalness: 0.04, clearcoat: 1, clearcoatRoughness: 0.05 })
const PATENT = (color: string): SurfaceSpec => ({ color, roughness: 0.07, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03 })
const FOAM = (color: string): SurfaceSpec => ({ color, roughness: 0.72, metalness: 0 })
const RUBBER = (color: string): SurfaceSpec => ({ color, roughness: 0.62, metalness: 0.03 })
const TEXTILE = (color: string): SurfaceSpec => ({ color, roughness: 0.84, metalness: 0, sheen: 0.5, sheenColor: '#ffffff' })
const SYNTH = (color: string): SurfaceSpec => ({ color, roughness: 0.46, metalness: 0.04, clearcoat: 0.35, clearcoatRoughness: 0.3 })
const METAL = (color: string, roughness = 0.24): SurfaceSpec => ({ color, roughness, metalness: 1 })

function surfaces(map: {
  mesh: string
  rib: string
  heel: string
  toe: string
  collar: string
  tongue: string
  lace: string
  eyestay: string
  chassis: string
  plate: string
  column: string
  outsole: string
  mark: string
  trim: string
  columnMetal?: number
  ribMetal?: number
}): Record<MaterialZone, SurfaceSpec> {
  const column = PATENT(map.column)
  if (map.columnMetal !== undefined) {
    column.metalness = map.columnMetal
    column.roughness = 0.06
  }
  const rib = GLOSS_TPU(map.rib)
  if (map.ribMetal !== undefined) {
    rib.metalness = map.ribMetal
    rib.roughness = 0.16
  }
  return {
    meshBase: MESH(map.mesh),
    tpuRib: rib,
    heelClip: PATENT(map.heel),
    toeBumper: GLOSS_TPU(map.toe),
    collar: TEXTILE(map.collar),
    tongue: MESH(map.tongue),
    lace: TEXTILE(map.lace),
    eyestay: SYNTH(map.eyestay),
    chassis: FOAM(map.chassis),
    plate: PATENT(map.plate),
    column,
    outsole: RUBBER(map.outsole),
    mark: SYNTH(map.mark),
    trim: METAL(map.trim),
  }
}

export const COLORWAYS: readonly Colorway[] = [
  {
    id: 'onyx',
    name: 'Onyx / Triple Black',
    code: 'SX-01 · ONYX',
    swatch: ['#1b1d22', '#050608'],
    accent: '#C7CED9',
    surfaces: surfaces({
      mesh: '#1a1c21',
      rib: '#0a0b0f',
      heel: '#07080a',
      toe: '#0c0d11',
      collar: '#15171b',
      tongue: '#181a1f',
      lace: '#101216',
      eyestay: '#0d0e12',
      chassis: '#121317',
      plate: '#08090c',
      column: '#06070a',
      outsole: '#0a0b0d',
      mark: '#33373f',
      trim: '#8d939e',
    }),
  },
  {
    id: 'summit',
    name: 'Summit / Bone White',
    code: 'SX-02 · SUMMIT',
    swatch: ['#f6f7f9', '#cdd0d6'],
    accent: '#FFFFFF',
    surfaces: surfaces({
      mesh: '#e9eaee',
      rib: '#f7f8fa',
      heel: '#fbfbfc',
      toe: '#f2f3f6',
      collar: '#e3e4e9',
      tongue: '#eceef1',
      lace: '#f4f5f7',
      eyestay: '#d9dbe1',
      chassis: '#f1f2f5',
      plate: '#fafafc',
      column: '#fdfdfe',
      outsole: '#c2c5cc',
      mark: '#b7bcc5',
      trim: '#a7adb7',
    }),
  },
  {
    id: 'chrome',
    name: 'Chrome / Liquid Metal',
    code: 'SX-03 · CHROME',
    swatch: ['#dfe5ee', '#7d8592'],
    accent: '#CFD7E3',
    surfaces: surfaces({
      mesh: '#5f6570',
      rib: '#b9c1cd',
      heel: '#c9d1dd',
      toe: '#a9b2be',
      collar: '#4c515a',
      tongue: '#565c66',
      lace: '#8b929d',
      eyestay: '#3f434b',
      chassis: '#8f97a3',
      plate: '#d2dae6',
      column: '#dbe3ef',
      outsole: '#23262b',
      mark: '#f0f4fa',
      trim: '#e2e8f0',
      columnMetal: 1,
      ribMetal: 0.9,
    }),
  },
  {
    id: 'crimson',
    name: 'Crimson Flash',
    code: 'SX-04 · CRIMSON',
    swatch: ['#f0281a', '#1a0b0a'],
    accent: '#F0281A',
    surfaces: surfaces({
      mesh: '#191a1f',
      rib: '#d92216',
      heel: '#0b0c0f',
      toe: '#1a1b20',
      collar: '#141519',
      tongue: '#16171c',
      lace: '#e6e7ea',
      eyestay: '#0e0f13',
      chassis: '#1c1d22',
      plate: '#0a0b0e',
      column: '#f0281a',
      outsole: '#0c0d10',
      mark: '#f4f5f7',
      trim: '#b9bec7',
    }),
  },
]

export const DEFAULT_COLORWAY = COLORWAYS[0].id

export const PRODUCT: ProductSpec = {
  brand: 'Nike',
  name: 'Shox TL',
  subtitle: 'Engineered for impact.',
  sku: 'SHOX-TL-1204',
  price: 199,
  currency: 'USD',
  currencySymbol: '$',
  description:
    'Full-length Shox column cushioning under a rib-cage upper. Twenty-two polyurethane columns stand between you and the ground, tuned to compress on impact and give it straight back.',
  sizes: [
    { eu: 40, us: '7', available: true },
    { eu: 41, us: '8', available: true },
    { eu: 42, us: '8.5', available: true },
    { eu: 43, us: '9.5', available: true },
    { eu: 44, us: '10', available: true },
    { eu: 45, us: '11', available: false },
  ],
  colorways: COLORWAYS,
  specs: [
    { label: 'Cushioning', value: 'Full-length Shox column array' },
    { label: 'Columns', value: '22 · 11 per side' },
    { label: 'Upper', value: 'Engineered mesh + TPU rib cage' },
    { label: 'Chassis', value: 'Dual TPU stability plate' },
    { label: 'Offset', value: '10 mm' },
    { label: 'Weight', value: '397 g · EU 42' },
  ],
}

export function colorwayById(id: string): Colorway {
  return COLORWAYS.find((c) => c.id === id) ?? COLORWAYS[0]
}

export function formatPrice(value: number): string {
  return `${PRODUCT.currencySymbol}${value.toFixed(value % 1 === 0 ? 0 : 2)}`
}
