import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'

/** HTML-Beschriftung an einem Punkt im Raum */
export interface Label {
  key: string
  position: Vector3
  content: ReactNode
}

const projected = new Vector3()

/** Alle Beschriftungen in einer HTML-Ebene: ein React-Root und eine Positionsberechnung pro Bild */
export function Labels({ items }: { items: Label[] }) {
  const { gl, camera, size } = useThree()
  const layer = useRef<HTMLDivElement | null>(null)
  const root = useRef<Root | null>(null)

  useLayoutEffect(() => {
    const target = gl.domElement.parentNode!
    const div = document.createElement('div')
    div.className = 'label-layer'
    target.appendChild(div)
    layer.current = div
    const current = (root.current = createRoot(div))
    return () => {
      target.removeChild(div)
      layer.current = root.current = null
      setTimeout(() => current.unmount())
    }
  }, [gl])

  useLayoutEffect(() => {
    root.current?.render(
      <>
        {items.map((item) => (
          <div key={item.key} className="label-anchor">
            {item.content}
          </div>
        ))}
      </>,
    )
  })

  useFrame(() => {
    const nodes = layer.current?.children
    if (!nodes) return
    items.forEach((item, i) => {
      const node = nodes[i] as HTMLElement | undefined
      if (!node) return
      projected.copy(item.position).project(camera)
      // Nur geänderte Werte schreiben, jede Stiländerung an 400 Knoten kostet Layout-Zeit
      const style = { display: projected.z > 1 ? 'none' : '', zIndex: String(Math.round((1 - projected.z) * 5)), transform: `translate3d(${Math.round(((projected.x + 1) / 2) * size.width)}px,${Math.round(((1 - projected.y) / 2) * size.height)}px,0)` }
      for (const key of ['display', 'zIndex', 'transform'] as const) if (node.style[key] !== style[key]) node.style[key] = style[key]
    })
  })

  return null
}
