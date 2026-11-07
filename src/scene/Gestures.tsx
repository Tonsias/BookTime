import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import type { Scope } from '../edit/ops'
import { findElement, type Book } from '../model'
import { describeDrop, hitAt, positionOf, type DropKind, type Target } from './hits'
import { LAYER_SIZE, ringRadius, type Layout, type NetPos } from './layout'

/** Umrechnung zwischen Bildschirm und Netz einer Ebene, bereitgestellt aus der 3D-Szene */
export interface Projector {
  toNet: (clientX: number, clientY: number, slice: number) => NetPos | null
  toScreen: (slice: number, pos: NetPos) => { x: number; y: number }
}

/** Startet ein Ziehen aus der Leiste „Ohne Ort“ */
export type Grab = (e: ReactPointerEvent, kind: 'person' | 'event', id: string) => void

interface GesturesProps {
  book: Book
  layout: Layout
  current: number
  scope: Scope
  enabled: boolean
  projector: RefObject<Projector | null>
  grab: MutableRefObject<Grab | null>
  children: ReactNode
  onSelect: (target: Target) => void
  /** Ort wird gezogen (Vorschau) oder losgelassen (`done`); ohne Position abgebrochen */
  onPlace: (id: string, pos: NetPos | null, done: boolean) => void
  onDrop: (kind: DropKind, source: Target, target: Target, at: { x: number; y: number }) => void
  onCreatePlace: (pos: NetPos) => void
}

interface Drag {
  source: Target
  start: { x: number; y: number }
  offset: NetPos
  moved: boolean
  tray: boolean
  pos?: NetPos
  target?: Target
  kind?: DropKind
}

interface Overlay {
  from: { x: number; y: number }
  to: { x: number; y: number }
  ring?: { x: number; y: number; r: number }
  text?: string
  move?: boolean
}

const START = 4

/** Ziehen auf der aktuellen Ebene: Orte verschieben, Personen und Events auf Ziele legen (Festlegungen 20–26) */
export function Gestures(props: GesturesProps) {
  const { projector, enabled } = props
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const latest = useRef(props)
  const [overlay, setOverlay] = useState<Overlay | null>(null)

  useEffect(() => {
    latest.current = props
  })

  useEffect(() => {
    const p = () => latest.current
    const net = (x: number, y: number) => projector.current?.toNet(x, y, p().current) ?? null
    const screen = (pos: NetPos) => projector.current!.toScreen(p().current, pos)
    const local = (point: { x: number; y: number }) => {
      const rect = box.current!.getBoundingClientRect()
      return { x: point.x - rect.left, y: point.y - rect.top }
    }

    const begin = (e: PointerEvent, source: Target, tray: boolean) => {
      const point = net(e.clientX, e.clientY)
      const center = positionOf(p().book, p().layout, p().current, source)
      drag.current = { source, tray, moved: tray, start: { x: e.clientX, y: e.clientY }, offset: center && point ? [center[0] - point[0], center[1] - point[1]] : [0, 0] }
    }

    const onDown = (e: PointerEvent) => {
      if (!latest.current.enabled || e.button !== 0) return
      const point = net(e.clientX, e.clientY)
      const source = point && hitAt(p().book, p().layout, p().current, point, 'ring')
      if (!source) return
      // Im Erfassen anhalten: die Kamera soll sich nicht drehen, wenn man ein Element anfasst
      e.stopPropagation()
      e.preventDefault()
      begin(e, source, false)
    }

    const onMove = (e: PointerEvent) => {
      const d = drag.current
      if (!d) {
        const point = latest.current.enabled && box.current?.contains(e.target as Node) ? net(e.clientX, e.clientY) : null
        if (box.current) box.current.style.cursor = point && hitAt(p().book, p().layout, p().current, point, 'ring') ? 'grab' : ''
        return
      }
      if (!d.moved && Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) < START) return
      d.moved = true
      const point = net(e.clientX, e.clientY)
      if (!point) return
      const { book, layout, current, scope } = p()
      const name = findElement(book, d.source.id)?.label ?? ''
      if (d.source.kind === 'place') {
        d.pos = [point[0] + d.offset[0], point[1] + d.offset[1]]
        p().onPlace(d.source.id, d.pos, false)
        setOverlay({ from: local({ x: e.clientX, y: e.clientY }), to: local({ x: e.clientX, y: e.clientY }), text: `${name} verschieben · ${scope === 'hier' ? `ab ${current + 1}` : 'ganze Phase'}`, move: true })
        return
      }
      const target = hitAt(book, layout, current, point, 'inside', d.source.id)
      const result = describeDrop(book, current, scope, d.source, target)
      d.target = result ? target : undefined
      d.kind = result?.kind
      const origin = positionOf(book, layout, current, d.source)
      const center = d.target && positionOf(book, layout, current, d.target)
      const radius = d.target?.kind === 'place' && center ? ringRadius(book.places.find((pl) => pl.id === d.target!.id)!) : 0.75
      const edge = center && screen([center[0] + radius, center[1]])
      const middle = center && screen(center)
      setOverlay({
        from: local(d.tray || !origin ? d.start : screen(origin)),
        to: local({ x: e.clientX, y: e.clientY }),
        ring: middle && edge ? { ...local(middle), r: Math.max(16, Math.hypot(edge.x - middle.x, edge.y - middle.y)) } : undefined,
        text: result?.text ?? 'Loslassen bricht ab',
      })
    }

    const end = (e: PointerEvent | null) => {
      const d = drag.current
      drag.current = null
      setOverlay(null)
      if (!d) return
      const { onSelect, onPlace, onDrop } = p()
      if (!d.moved) {
        if (!d.tray) onSelect(d.source)
        return
      }
      if (d.source.kind === 'place') onPlace(d.source.id, e && d.pos ? d.pos : null, true)
      else if (e && d.target && d.kind) onDrop(d.kind, d.source, d.target, { x: e.clientX, y: e.clientY })
    }

    const onUp = (e: PointerEvent) => end(e)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && drag.current && end(null)
    const onDouble = (e: MouseEvent) => {
      if (!latest.current.enabled) return
      const point = net(e.clientX, e.clientY)
      if (!point || Math.abs(point[0]) > LAYER_SIZE / 2 || Math.abs(point[1]) > LAYER_SIZE / 2) return
      if (hitAt(p().book, p().layout, p().current, point, 'ring')) return
      p().onCreatePlace(point)
    }

    props.grab.current = (e, kind, id) => {
      e.preventDefault()
      begin(e.nativeEvent, { kind, id }, true)
    }

    const target = box.current!
    target.addEventListener('pointerdown', onDown, true)
    target.addEventListener('dblclick', onDouble)
    addEventListener('pointermove', onMove)
    addEventListener('pointerup', onUp)
    addEventListener('pointercancel', onUp)
    addEventListener('keydown', onKey)
    return () => {
      target.removeEventListener('pointerdown', onDown, true)
      target.removeEventListener('dblclick', onDouble)
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerup', onUp)
      removeEventListener('pointercancel', onUp)
      removeEventListener('keydown', onKey)
    }
    // Einmal einrichten; aktuelle Props kommen über latest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projector])

  useTestAccess(props)

  return (
    <div ref={box} className={`gestures ${enabled ? '' : 'off'}`}>
      {props.children}
      {overlay && (
        <>
          <svg className="gesture-overlay" aria-hidden>
            {!overlay.move && <line x1={overlay.from.x} y1={overlay.from.y} x2={overlay.to.x} y2={overlay.to.y} className="rubber" />}
            {overlay.ring && <circle cx={overlay.ring.x} cy={overlay.ring.y} r={overlay.ring.r} className="target-ring" />}
          </svg>
          <div className={`drag-tag ${overlay.ring || overlay.move ? '' : 'none'}`} style={{ left: overlay.to.x, top: overlay.to.y }} role="status">
            {overlay.text}
          </div>
        </>
      )}
    </div>
  )
}

declare global {
  interface Window {
    __booktime?: {
      id: (name: string) => string | null
      pos: (id: string) => NetPos | null
      screen: (id: string) => { x: number; y: number } | null
      net: (u: number, v: number) => { x: number; y: number } | null
      hit: (u: number, v: number) => Target | null
    }
  }
}

// Nur im Build-Modus e2e: Bildschirmpositionen für Playwright, die Szene hat sonst keine ansprechbaren DOM-Elemente
function useTestAccess({ book, layout, current, projector }: GesturesProps) {
  useEffect(() => {
    if (import.meta.env.MODE !== 'e2e') return
    const pos = (id: string) => {
      const kind = findElement(book, id)?.kind
      return (kind && kind !== 'group' && positionOf(book, layout, current, { kind, id })) || null
    }
    const screen = (p: NetPos | null) => (p && projector.current ? projector.current.toScreen(current, p) : null)
    window.__booktime = {
      id: (name) => [...book.persons, ...book.groups, ...book.places].find((e) => e.name === name)?.id ?? book.events.find((e) => e.title === name)?.id ?? null,
      pos,
      screen: (id) => screen(pos(id)),
      net: (u, v) => screen([u, v]),
      hit: (u, v) => hitAt(book, layout, current, [u, v], 'inside') ?? null,
    }
  }, [book, layout, current, projector])
}
