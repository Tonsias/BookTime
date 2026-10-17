import { useEffect, useMemo, useRef, type ComponentRef } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { CameraControls, Edges, Html, Line } from '@react-three/drei'
import { DoubleSide, Plane, Vector3 } from 'three'
import { RELATION_COLORS, type Book, type Entity, type Selection, type SliceState, type View } from '../model'
import { LAYER_SIZE, SLICE_SPACING, slicePoint, strandSegments, type Layout, type NetPos } from './layout'

interface SceneProps {
  book: Book
  states: SliceState[]
  layout: Layout
  current: number
  view: View
  selection: Selection | null
  focus: Set<string> | null
  onSelect: (selection: Selection | null) => void
  onJump: (index: number) => void
}

const noRaycast = () => null

const setCursor = (pointer: boolean) => () => {
  document.body.style.cursor = pointer ? 'pointer' : ''
}

export function Scene(props: SceneProps) {
  const { book, states, layout, current, view, selection, focus, onSelect, onJump } = props
  const selectedId = selection?.kind === 'entity' ? selection.id : null

  const emphasis = (id: string) => {
    if (!focus || id === selectedId) return 1
    if (focus.has(id)) return selectedId ? 0.6 : 1
    return 0.12
  }

  // In der Netz-Ansicht schaut man entlang der Zeit: Vergangenheit ausblenden, Zukunft als Echo
  const sliceOpacity = (i: number) => {
    if (i === current) return 1
    if (view === 'netz') return i > current ? 0.3 / (i - current) : 0
    return 0.45
  }

  const select = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onSelect({ kind: 'entity', id })
  }

  const persons = book.entities.filter((e) => e.kind === 'person')
  const places = book.entities.filter((e) => e.kind === 'place')

  return (
    <Canvas camera={{ position: [-20, 14, 30], fov: 45 }} onPointerMissed={(e) => {
        // Klicks auf HTML-Labels landen auch hier – nur echte Klicks ins Leere heben die Auswahl auf
        if ((e.target as HTMLElement).tagName === 'CANVAS') onSelect(null)
      }}>
      <color attach="background" args={['#0b0d12']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[-10, 20, 15]} intensity={1.2} />
      <CameraRig view={view} current={current} count={book.events.length} />
      <TimeClip enabled={view === 'netz'} x={current * SLICE_SPACING} />

      {book.events.map((event, i) =>
        sliceOpacity(i) > 0 ? (
          <Layer key={event.id} index={i} title={event.title} active={i === current} opacity={sliceOpacity(i)} onJump={onJump} />
        ) : null,
      )}

      {places.map((place) => (
        <PlaceRings
          key={place.id}
          place={place}
          pos={layout.places.get(place.id)!}
          count={book.events.length}
          emphasis={emphasis(place.id)}
          sliceOpacity={sliceOpacity}
          current={current}
          onClick={select(place.id)}
        />
      ))}

      {persons.map((person) => (
        <PersonStrand
          key={person.id}
          person={person}
          track={layout.persons.get(person.id)!}
          emphasis={emphasis(person.id)}
          selected={person.id === selectedId}
          strandOpacity={view === 'netz' ? 0.35 : 0.85}
          sliceOpacity={sliceOpacity}
          current={current}
          onClick={select(person.id)}
        />
      ))}

      {states.map((state, i) =>
        sliceOpacity(i) > 0
          ? state.relations.map((r) => {
              const a = layout.persons.get(r.a)?.[i]
              const b = layout.persons.get(r.b)?.[i]
              if (!a || !b) return null
              const involvesSelected = r.a === selectedId || r.b === selectedId
              const relEmphasis = !focus ? 1 : involvesSelected ? 1 : focus.has(r.a) && focus.has(r.b) ? 0.3 : 0.08
              return (
                <Line
                  key={`${i}-${r.a}-${r.b}`}
                  points={[slicePoint(i, a), slicePoint(i, b)]}
                  color={RELATION_COLORS[r.kind]}
                  lineWidth={i === current ? 2.5 : 1.5}
                  dashed={r.kind === 'misstrauen'}
                  dashSize={0.3}
                  gapSize={0.2}
                  transparent
                  opacity={sliceOpacity(i) * relEmphasis}
                  raycast={noRaycast}
                />
              )
            })
          : null,
      )}

      {/* Beschriftungen nur auf der aktuellen Ebene */}
      {places.map((place) => {
        const pos = layout.places.get(place.id)!
        return (
          <Label key={place.id} position={slicePoint(current, [pos[0], pos[1] - 2.6])} color={place.color} dim={emphasis(place.id) < 0.5} onClick={() => onSelect({ kind: 'entity', id: place.id })}>
            {place.name}
          </Label>
        )
      })}
      {persons.map((person) => {
        const pos = layout.persons.get(person.id)![current]
        if (!pos) return null
        return (
          <Label
            key={person.id}
            position={slicePoint(current, [pos[0], pos[1] + 0.9])}
            color={person.color}
            dim={emphasis(person.id) < 0.5}
            strong
            onClick={() => onSelect({ kind: 'entity', id: person.id })}
          >
            {person.name}
          </Label>
        )
      })}
    </Canvas>
  )
}

function CameraRig({ view, current, count }: { view: View; current: number; count: number }) {
  const ref = useRef<ComponentRef<typeof CameraControls>>(null)
  const mid = ((count - 1) * SLICE_SPACING) / 2
  // Im Raum frei drehen lassen; nur die Netz-Ansicht folgt der aktuellen Ebene
  const follow = view === 'netz' ? current : -1

  useEffect(() => {
    const controls = ref.current
    if (!controls) return
    const x = current * SLICE_SPACING
    if (view === 'netz') controls.setLookAt(x - 38, 0, 0, x, 0, 0, true)
    else if (view === 'zeit') controls.setLookAt(mid, 0, 58, mid, 0, 0, true)
    else controls.setLookAt(mid - 34, 20, 40, mid, 0, 0, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, follow, mid])

  return <CameraControls ref={ref} makeDefault />
}

/** Schneidet in der Netz-Ansicht alles vor der aktuellen Ebene weg */
function TimeClip({ enabled, x }: { enabled: boolean; x: number }) {
  const get = useThree((s) => s.get)
  useEffect(() => {
    get().gl.clippingPlanes = enabled ? [new Plane(new Vector3(1, 0, 0), -(x - 0.5))] : []
  }, [get, enabled, x])
  return null
}

function Layer(props: { index: number; title: string; active: boolean; opacity: number; onJump: (i: number) => void }) {
  const { index, title, active, opacity, onJump } = props
  return (
    <group position={[index * SLICE_SPACING, 0, 0]}>
      <mesh rotation={[0, Math.PI / 2, 0]} raycast={noRaycast}>
        <planeGeometry args={[LAYER_SIZE, LAYER_SIZE]} />
        <meshBasicMaterial color={active ? '#6b8cff' : '#ffffff'} transparent opacity={(active ? 0.07 : 0.025) * opacity} side={DoubleSide} depthWrite={false} />
        <Edges color={active ? '#6b8cff' : '#3a4152'} />
      </mesh>
      <Html position={[0, LAYER_SIZE / 2 + 1, 0]} center zIndexRange={[10, 0]} style={{ opacity }}>
        <button type="button" className={`layer-label${active ? ' active' : ''}`} onClick={() => onJump(index)}>
          {index + 1}. {title}
        </button>
      </Html>
    </group>
  )
}

function PlaceRings(props: {
  place: Entity
  pos: NetPos
  count: number
  emphasis: number
  sliceOpacity: (i: number) => number
  current: number
  onClick: (e: ThreeEvent<MouseEvent>) => void
}) {
  const { place, pos, count, emphasis, sliceOpacity, current, onClick } = props
  return (
    <>
      <Line points={[slicePoint(0, pos), slicePoint(count - 1, pos)]} color={place.color} lineWidth={1} transparent opacity={0.25 * emphasis} raycast={noRaycast} />
      {Array.from({ length: count }, (_, i) =>
        sliceOpacity(i) > 0 ? (
          <mesh key={i} position={slicePoint(i, pos)} rotation={[0, Math.PI / 2, 0]} onClick={onClick} onPointerOver={setCursor(true)} onPointerOut={setCursor(false)}>
            <ringGeometry args={[2.1, i === current ? 2.4 : 2.25, 64]} />
            <meshBasicMaterial color={place.color} transparent opacity={emphasis * sliceOpacity(i) * (i === current ? 0.9 : 0.5)} side={DoubleSide} depthWrite={false} />
          </mesh>
        ) : null,
      )}
    </>
  )
}

function PersonStrand(props: {
  person: Entity
  track: (NetPos | null)[]
  emphasis: number
  selected: boolean
  strandOpacity: number
  sliceOpacity: (i: number) => number
  current: number
  onClick: (e: ThreeEvent<MouseEvent>) => void
}) {
  const { person, track, emphasis, selected, strandOpacity, sliceOpacity, current, onClick } = props
  const segments = useMemo(() => strandSegments(track), [track])
  return (
    <>
      {segments.map((points, k) => (
        <Line key={k} points={points} color={person.color} lineWidth={selected ? 5 : 2.5} transparent opacity={strandOpacity * emphasis} onClick={onClick} />
      ))}
      {track.map((pos, i) =>
        pos && sliceOpacity(i) > 0 ? (
          <mesh key={i} position={slicePoint(i, pos)} onClick={onClick} onPointerOver={setCursor(true)} onPointerOut={setCursor(false)}>
            <sphereGeometry args={[i === current ? 0.45 : 0.28, 24, 24]} />
            <meshStandardMaterial color={person.color} emissive={person.color} emissiveIntensity={0.35} transparent opacity={emphasis * sliceOpacity(i)} />
          </mesh>
        ) : null,
      )}
    </>
  )
}

function Label(props: { position: Vector3; color: string; dim: boolean; strong?: boolean; onClick: () => void; children: React.ReactNode }) {
  const { position, color, dim, strong, onClick, children } = props
  return (
    <Html position={position} center zIndexRange={[10, 0]}>
      <button type="button" className={`scene-label${strong ? ' strong' : ''}`} style={{ borderColor: color, color, opacity: dim ? 0.3 : 1 }} onClick={onClick}>
        {children}
      </button>
    </Html>
  )
}
