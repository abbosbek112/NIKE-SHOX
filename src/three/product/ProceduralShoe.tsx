import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { Matrix4, type Group, type InstancedMesh } from 'three'
import type { MaterialZone } from '@/types'
import type { ShoeMaterials } from '@/three/materials/materials'
import {
  buildShoe,
  columnMatrix,
  COLUMN_COUNT,
  COMPRESS_DROP,
  COMPRESS_PITCH,
  EXPLODE_GROUNDED,
  EXPLODE_SPRUNG,
} from './geometry'

/**
 * The sneaker itself: fourteen material zones plus an instanced column array.
 *
 * The shoe is split into a *grounded* half (outsole and lower Shox plate) and a
 * *sprung* half (everything the columns hold up). When the columns squash, the
 * sprung half drops and pitches nose-up by exactly the amount the differential
 * squash removes — see `COMPRESS_DROP` / `COMPRESS_PITCH` — so the sole stack
 * stays visually welded together through the whole compression cycle.
 *
 * No per-frame work happens here. The parent rig owns the single `useFrame` and
 * pushes values in through `apply()`, which keeps frame ordering deterministic.
 */

/** Zones carried by the columns. `column` is instanced, `outsole` is grounded. */
const SPRUNG_ZONES: readonly MaterialZone[] = [
  'chassis',
  'plate',
  'meshBase',
  'tpuRib',
  'heelClip',
  'toeBumper',
  'eyestay',
  'collar',
  'tongue',
  'lace',
  'mark',
  'trim',
]

export interface ShoeHandle {
  apply(compress: number, explode: number): void
  readonly triangles: number
}

export interface ProceduralShoeProps {
  materials: ShoeMaterials
  /** Tessellation multiplier from the performance profile. */
  detail: number
  shadows: boolean
}

export const ProceduralShoe = forwardRef<ShoeHandle, ProceduralShoeProps>(function ProceduralShoe(
  { materials, detail, shadows },
  ref,
) {
  const shoe = useMemo(() => buildShoe(detail), [detail])
  useEffect(() => () => shoe.dispose(), [shoe])

  const sprung = useRef<Group>(null)
  const grounded = useRef<Group>(null)
  const columns = useRef<InstancedMesh>(null)
  const matrix = useMemo(() => new Matrix4(), [])

  useImperativeHandle(
    ref,
    () => ({
      triangles: shoe.triangles,
      apply(compress: number, explode: number) {
        if (sprung.current) {
          sprung.current.position.y = explode * EXPLODE_SPRUNG - compress * COMPRESS_DROP
          sprung.current.rotation.z = compress * COMPRESS_PITCH
        }
        if (grounded.current) grounded.current.position.y = explode * EXPLODE_GROUNDED
        const mesh = columns.current
        if (mesh) {
          for (let i = 0; i < shoe.stations.length; i++) {
            mesh.setMatrixAt(i, columnMatrix(shoe.stations[i], compress, explode, matrix))
          }
          mesh.instanceMatrix.needsUpdate = true
        }
      },
    }),
    [shoe, matrix],
  )

  // Seed the instance matrices so the first rendered frame is already correct.
  useEffect(() => {
    const mesh = columns.current
    if (!mesh) return
    const m = new Matrix4()
    shoe.stations.forEach((station, i) => mesh.setMatrixAt(i, columnMatrix(station, 0, 0, m)))
    mesh.instanceMatrix.needsUpdate = true
  }, [shoe])

  return (
    <group name="shoe">
      <group name="shoe-sprung" ref={sprung}>
        {SPRUNG_ZONES.map((zone) => (
          <mesh
            key={zone}
            name={zone}
            geometry={shoe.zones[zone]}
            material={materials.materials[zone]}
            castShadow={shadows}
            receiveShadow={shadows}
          />
        ))}
      </group>

      <instancedMesh
        ref={columns}
        name="shox-columns"
        args={[shoe.zones.column, materials.materials.column, COLUMN_COUNT]}
        castShadow={shadows}
        receiveShadow={shadows}
        frustumCulled={false}
      />

      <group name="shoe-grounded" ref={grounded}>
        <mesh
          name="outsole"
          geometry={shoe.zones.outsole}
          material={materials.materials.outsole}
          castShadow={shadows}
          receiveShadow={shadows}
        />
        <mesh
          name="plate-lower"
          geometry={shoe.lowerPlate}
          material={materials.materials.plate}
          castShadow={shadows}
          receiveShadow={shadows}
        />
      </group>
    </group>
  )
})
