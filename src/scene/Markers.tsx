import { useLayoutEffect, useMemo, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { BufferGeometry, Color, DoubleSide, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Vector3 } from 'three'

/** Ein Marker in der Szene; Marker mit gleicher Form und Deckkraft teilen sich ein Instanced Mesh */
export interface Marker {
  key: string
  shape: string
  position: Vector3
  color: string
  opacity: number
  scale?: number
  rotation?: Quaternion
}

interface MarkersProps {
  items: Marker[]
  geometry: (shape: string) => BufferGeometry
  glow?: number
  onClick?: (item: Marker) => void
}

const matrix = new Matrix4()
const unit = new Vector3(1, 1, 1)
const none = new Quaternion()

/** Viele gleichartige Marker mit wenigen Draw Calls: je Form und Deckkraft ein Instanced Mesh */
export function Markers({ items, geometry, glow, onClick }: MarkersProps) {
  const groups = useMemo(() => {
    const map = new Map<string, Marker[]>()
    for (const item of items) {
      const key = `${item.shape}|${item.opacity.toFixed(3)}`
      map.set(key, [...(map.get(key) ?? []), item])
    }
    return [...map.entries()]
  }, [items])
  return (
    <>
      {groups.map(([key, group]) => (
        <MarkerGroup key={`${key}|${group.length}`} items={group} geometry={geometry(group[0]!.shape)} glow={glow} onClick={onClick} />
      ))}
    </>
  )
}

function MarkerGroup({ items, geometry, glow, onClick }: Omit<MarkersProps, 'geometry'> & { geometry: BufferGeometry }) {
  const mesh = useRef<InstancedMesh>(null)
  const opacity = items[0]!.opacity
  const material = useMemo(() => {
    if (glow === undefined) return new MeshBasicMaterial({ transparent: true, opacity, depthWrite: false, side: DoubleSide })
    const lit = new MeshStandardMaterial({ transparent: true, opacity, emissive: new Color(glow, glow, glow) })
    lit.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vColor.rgb;')
    }
    return lit
  }, [glow, opacity])

  useLayoutEffect(() => {
    const target = mesh.current
    if (!target) return
    items.forEach((item, i) => {
      matrix.compose(item.position, item.rotation ?? none, unit.clone().multiplyScalar(item.scale ?? 1))
      target.setMatrixAt(i, matrix)
      target.setColorAt(i, new Color(item.color))
    })
    target.instanceMatrix.needsUpdate = true
    if (target.instanceColor) target.instanceColor.needsUpdate = true
    target.computeBoundingSphere()
  }, [items])

  useLayoutEffect(() => () => material.dispose(), [material])

  const click = (e: ThreeEvent<MouseEvent>) => {
    const item = e.instanceId === undefined ? undefined : items[e.instanceId]
    if (!item || !onClick) return
    e.stopPropagation()
    onClick(item)
  }

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, items.length]}
      {...(onClick
        ? { onClick: click, onPointerOver: () => (document.body.style.cursor = 'pointer'), onPointerOut: () => (document.body.style.cursor = '') }
        : { raycast: () => null })}
    />
  )
}
