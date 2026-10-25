import { useLayoutEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { Color, Vector3 } from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'

/** Eine Linie zwischen zwei Punkten; Linien gleicher Breite und Deckkraft werden zusammen gezeichnet */
export interface Segment {
  from: Vector3
  to: Vector3
  color: string
  width: number
  opacity: number
}

/** Viele breite Linien mit wenigen Draw Calls: je Breite und Deckkraft ein LineSegments2 */
export function Segments({ items }: { items: Segment[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, Segment[]>()
    for (const item of items) {
      const key = `${item.width.toFixed(2)}|${item.opacity.toFixed(3)}`
      map.set(key, [...(map.get(key) ?? []), item])
    }
    return [...map.values()]
  }, [items])
  return (
    <>
      {groups.map((group) => (
        <SegmentGroup key={`${group[0]!.width}|${group[0]!.opacity}|${group.length}`} items={group} />
      ))}
    </>
  )
}

function SegmentGroup({ items }: { items: Segment[] }) {
  const size = useThree((s) => s.size)
  const line = useMemo(() => {
    const geometry = new LineSegmentsGeometry()
    geometry.setPositions(items.flatMap(({ from, to }) => [from.x, from.y, from.z, to.x, to.y, to.z]))
    geometry.setColors(
      items.flatMap(({ color }) => {
        const { r, g, b } = new Color(color)
        return [r, g, b, r, g, b]
      }),
    )
    const material = new LineMaterial({ linewidth: items[0]!.width, vertexColors: true, transparent: true, opacity: items[0]!.opacity, depthWrite: false })
    const segments = new LineSegments2(geometry, material)
    segments.raycast = () => undefined
    return segments
  }, [items])

  useLayoutEffect(() => {
    line.material.resolution.set(size.width, size.height)
  }, [line, size])
  useLayoutEffect(
    () => () => {
      line.geometry.dispose()
      line.material.dispose()
    },
    [line],
  )
  return <primitive object={line} />
}
