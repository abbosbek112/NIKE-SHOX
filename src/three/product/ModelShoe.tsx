import { forwardRef, useEffect, useImperativeHandle, useMemo } from 'react'
import type { Object3D } from 'three'
import {
  COMPRESS_DROP,
  COMPRESS_PITCH,
  COMPRESS_TRAVEL,
  EXPLODE_COLUMN,
  EXPLODE_GROUNDED,
  EXPLODE_SPRUNG,
} from './geometry'
import type { ProductModel } from './loadModel'
import type { ShoeHandle } from './ProceduralShoe'

/**
 * A loaded GLB, wearing the same `ShoeHandle` the procedural shoe wears.
 *
 * The rig above this does not know or care which one it has: it calls
 * `apply(compress, explode)` and everything else is the timeline's business. What
 * changes here is how much of the teardown is possible. `ProceduralShoe` was built
 * in separable halves, so its sole comes apart by construction. A real model comes
 * apart only if whoever exported it named the parts — a photogrammetry scan or an
 * image-to-3D result is one welded shell, and for those every loop below runs zero
 * times and the chapter reads as a hold rather than a teardown.
 *
 * Offsets are added to each part's rest pose rather than assigned. The parts are
 * wherever the file put them, and the procedural shoe's numbers are deltas — a
 * heel that sits at y = 0.31 must rise to 0.45 on a full explode, not drop to 0.14.
 */

interface Rest {
  node: Object3D
  y: number
  roll: number
  scaleY: number
}

const snapshot = (nodes: readonly Object3D[]): Rest[] =>
  nodes.map((node) => ({ node, y: node.position.y, roll: node.rotation.z, scaleY: node.scale.y }))

export interface ModelShoeProps {
  model: ProductModel
  shadows: boolean
}

export const ModelShoe = forwardRef<ShoeHandle, ModelShoeProps>(function ModelShoe({ model, shadows }, ref) {
  // Taken during render, before any `apply` can move anything.
  const rest = useMemo(
    () => ({
      sprung: snapshot(model.parts.sprung),
      grounded: snapshot(model.parts.grounded),
      columns: snapshot(model.parts.columns),
    }),
    [model],
  )

  // Shadow casting is a performance-profile decision, and the loader — which runs
  // before any profile is in scope — has no business making it.
  useEffect(() => {
    model.root.traverse((object) => {
      if ((object as Object3D & { isMesh?: boolean }).isMesh) {
        object.castShadow = shadows
        object.receiveShadow = false
      }
    })
  }, [model, shadows])

  useImperativeHandle(
    ref,
    () => ({
      triangles: model.measured.triangles,
      apply(compress: number, explode: number) {
        for (const part of rest.sprung) {
          part.node.position.y = part.y + explode * EXPLODE_SPRUNG - compress * COMPRESS_DROP
          part.node.rotation.z = part.roll + compress * COMPRESS_PITCH
        }
        for (const part of rest.grounded) {
          part.node.position.y = part.y + explode * EXPLODE_GROUNDED
        }
        // Squashed about the group's own origin, which for a column array authored
        // on the floor plane is the base — the same end the procedural spools
        // compress from.
        for (const part of rest.columns) {
          part.node.position.y = part.y + explode * EXPLODE_COLUMN
          part.node.scale.y = part.scaleY * (1 - COMPRESS_TRAVEL * compress)
        }
      },
    }),
    [model, rest],
  )

  return <primitive object={model.root} />
})
