import { Component, Suspense, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { CameraControls, Edges, Line, useTexture } from '@react-three/drei'
import { BufferGeometry, ConeGeometry, DoubleSide, OctahedronGeometry, Plane, Quaternion, RingGeometry, SphereGeometry, SRGBColorSpace, Vector3 } from 'three'
import { backgroundAt, covers, elementColor, factsAt, phaseAt, type Book, type TimePoint } from '../model'
import type { Selection, View } from '../ui/types'
import { Labels, type Label } from './Labels'
import { LAYER_SIZE, SLICE_SPACING, ringRadius, slicePoint, strandSegments, type Layout, type NetPos } from './layout'
import { Markers, type Marker } from './Markers'
import { Segments, type Segment } from './Segments'

interface SceneProps {
  book: Book
  imageUrl: (file: string) => Promise<string | undefined>
  points: TimePoint[]
  layout: Layout
  current: number
  view: View
  selection: Selection | null
  focus: Set<string> | null
  onSelect: (selection: Selection | null) => void
  onJump: (index: number) => void
}

const noRaycast = () => null
const UP = new Vector3(0, 1, 0)

const ringShape = (radius: number, current: boolean) => `ring:${radius}:${current}`
const geometries = new Map<string, BufferGeometry>()

/** Geometrien werden pro Form einmal angelegt und von allen Markern geteilt */
const geometryFor = (shape: string) => {
  let geometry = geometries.get(shape)
  if (!geometry) {
    const [kind, a, b] = shape.split(':')
    if (kind === 'ring') geometry = new RingGeometry(Number(a), Number(a) + (b === 'true' ? 0.3 : 0.15), 64).rotateY(Math.PI / 2)
    else if (kind === 'cone') geometry = new ConeGeometry(0.16, 0.45, 12)
    else if (kind === 'octahedron') geometry = new OctahedronGeometry(1)
    else geometry = new SphereGeometry(1, 24, 24)
    geometries.set(shape, geometry)
  }
  return geometry
}

/** 3D-Raum-Zeit-Würfel: Ebenen je Zeitpunkt, Personen als Stränge, Orte als Ringe, Beziehungen als Kanten, Events als Marker */
export function Scene(props: SceneProps) {
  const { book, imageUrl, points, layout, current, view, selection, focus, onSelect, onJump } = props
  const selectedId = selection?.id ?? null
  const count = points.length
  const color = (id: string) => elementColor(book, id)

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
  const visible = points.map((_, i) => i).filter((i) => sliceOpacity(i) > 0)

  const select = (kind: Selection['kind'], id: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onSelect({ kind, id })
  }
  const pick = (kind: Selection['kind']) => (marker: Marker) => onSelect({ kind, id: marker.key.split('@')[0]! })

  const markerAt = (id: string, i: number, pos: NetPos, shape: string, opacity: number, scale?: number): Marker => ({
    key: `${id}@${i}`,
    shape,
    position: slicePoint(i, pos),
    color: color(id),
    opacity,
    scale,
  })

  const rings = visible.flatMap((i) =>
    book.places.flatMap((place) => {
      const pos = layout.places.get(place.id)?.[i]
      const opacity = emphasis(place.id) * sliceOpacity(i) * (i === current ? 0.9 : 0.5)
      return pos ? [markerAt(place.id, i, pos, ringShape(ringRadius(place), i === current), opacity)] : []
    }),
  )
  const spheres = visible.flatMap((i) =>
    book.persons.flatMap((person) => {
      const pos = layout.persons.get(person.id)?.[i]
      return pos ? [markerAt(person.id, i, pos, 'sphere', emphasis(person.id) * sliceOpacity(i), i === current ? 0.45 : 0.28)] : []
    }),
  )
  const octahedra = visible.flatMap((i) =>
    book.events.flatMap((event) => {
      const pos = event.place && covers(book, event.timing, i) ? layout.places.get(event.place)?.[i] : undefined
      return pos ? [markerAt(event.id, i, pos, 'octahedron', emphasis(event.id) * sliceOpacity(i), i === current ? 0.5 : 0.32)] : []
    }),
  )

  const lines: Segment[] = []
  const arrows: Marker[] = []
  for (const i of visible) {
    for (const fact of factsAt(book, i)) {
      if (fact.kind !== 'relation') continue
      const phase = phaseAt(book, fact.phases, i)
      const type = book.relationTypes.find((t) => t.id === phase?.type)
      const a = layout.persons.get(fact.from)?.[i]
      const b = layout.persons.get(fact.to)?.[i]
      if (!phase || !type || !a || !b) continue
      const involvesSelected = fact.from === selectedId || fact.to === selectedId
      const relEmphasis = !focus || involvesSelected ? 1 : focus.has(fact.from) && focus.has(fact.to) ? 0.3 : 0.08
      const opacity = sliceOpacity(i) * relEmphasis
      const [from, to] = [slicePoint(i, a), slicePoint(i, b)]
      lines.push({ from, to, color: type.color, width: phase.strength * (i === current ? 0.8 : 0.5) + 0.5, opacity })
      if (!type.directed) continue
      const dir = to.clone().sub(from).normalize()
      const position = to.clone().sub(dir.clone().multiplyScalar(0.75))
      arrows.push({ key: `${fact.id}@${i}`, shape: 'cone', position, color: type.color, opacity, rotation: new Quaternion().setFromUnitVectors(UP, dir) })
    }
  }

  const labels: Label[] = visible.map((i) => ({
    key: `layer-${i}`,
    position: new Vector3(i * SLICE_SPACING, LAYER_SIZE / 2 + 1, 0),
    content: (
      <button type="button" className={`layer-label${i === current ? ' active' : ''}`} style={{ opacity: sliceOpacity(i) }} onClick={() => onJump(i)}>
        {i + 1}. {points[i]?.name}
      </button>
    ),
  }))
  // Beschriftungen von Orten und Personen nur auf der aktuellen Ebene
  for (const place of book.places) {
    const pos = layout.places.get(place.id)?.[current]
    if (!pos) continue
    // Unterorte oben beschriften, sonst überdeckt ihr Label das des Elternorts
    const above = !!phaseAt(book, place.phases, current)?.parent
    labels.push({
      key: place.id,
      position: slicePoint(current, [pos[0], pos[1] + (above ? 1 : -1) * (ringRadius(place) + 0.5)]),
      content: <SceneLabel color={color(place.id)} dim={emphasis(place.id) < 0.5} text={place.name} onClick={() => onSelect({ kind: 'place', id: place.id })} />,
    })
  }
  for (const person of book.persons) {
    const pos = layout.persons.get(person.id)?.[current]
    if (!pos) continue
    labels.push({
      key: person.id,
      position: slicePoint(current, [pos[0], pos[1] + 0.9]),
      content: <SceneLabel color={color(person.id)} dim={emphasis(person.id) < 0.5} strong text={person.name} onClick={() => onSelect({ kind: 'person', id: person.id })} />,
    })
  }

  return (
    <Canvas camera={{ position: [-20, 14, 30], fov: 45 }} onPointerMissed={(e) => {
        // Klicks auf HTML-Labels landen auch hier – nur echte Klicks ins Leere heben die Auswahl auf
        if ((e.target as HTMLElement).tagName === 'CANVAS') onSelect(null)
      }}>
      <color attach="background" args={['#0b0d12']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[-10, 20, 15]} intensity={1.2} />
      <CameraRig view={view} current={current} count={count} />
      <TimeClip enabled={view === 'netz'} x={current * SLICE_SPACING} />

      {visible.map((i) => (
        <Layer key={i} index={i} active={i === current} opacity={sliceOpacity(i)} />
      ))}
      {visible.map((i) => {
        const background = backgroundAt(book, i)
        if (!background || view === 'zeit' || (view === 'netz' && i !== current)) return null
        const { file, x, y, width } = background
        return <Backdrop key={i} file={file} imageUrl={imageUrl} position={slicePoint(i, [x, y])} width={width} opacity={i === current ? 0.4 : 0.12} />
      })}

      {book.places.map((place) => (
        <Strand key={place.id} track={layout.places.get(place.id)!} color={color(place.id)} lineWidth={1} opacity={0.25 * emphasis(place.id)} onClick={select('place', place.id)} />
      ))}
      {book.persons.map((person) => (
        <Strand
          key={person.id}
          track={layout.persons.get(person.id)!}
          color={color(person.id)}
          lineWidth={person.id === selectedId ? 5 : 2.5}
          opacity={(view === 'netz' ? 0.35 : 0.85) * emphasis(person.id)}
          onClick={select('person', person.id)}
        />
      ))}
      <Markers items={rings} geometry={geometryFor} onClick={pick('place')} />
      <Markers items={spheres} geometry={geometryFor} glow={0.35} onClick={pick('person')} />
      <Markers items={octahedra} geometry={geometryFor} glow={0.4} onClick={pick('event')} />
      <Segments items={lines} />
      <Markers items={arrows} geometry={geometryFor} />
      <Labels items={labels} />
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

function Layer({ index, active, opacity }: { index: number; active: boolean; opacity: number }) {
  return (
    <mesh position={[index * SLICE_SPACING, 0, 0]} rotation={[0, Math.PI / 2, 0]} raycast={noRaycast}>
      <planeGeometry args={[LAYER_SIZE, LAYER_SIZE]} />
      <meshBasicMaterial color={active ? '#6b8cff' : '#ffffff'} transparent opacity={(active ? 0.07 : 0.025) * opacity} side={DoubleSide} depthWrite={false} />
      <Edges color={active ? '#6b8cff' : '#3a4152'} />
    </mesh>
  )
}

function Backdrop(props: { file: string; imageUrl: SceneProps['imageUrl']; position: Vector3; width: number; opacity: number }) {
  const { file, imageUrl } = props
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    imageUrl(file).then(setUrl)
  }, [file, imageUrl])
  return url ? (
    <SkipOnError>
      <Suspense fallback={null}>
        <BackdropPlane {...props} url={url} />
      </Suspense>
    </SkipOnError>
  ) : null
}

class SkipOnError extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

function BackdropPlane({ url, position, width, opacity }: { url: string; position: Vector3; width: number; opacity: number }) {
  const texture = useTexture(url, (t) => {
    t.colorSpace = SRGBColorSpace
  })
  const { width: w, height: h } = texture.image as { width: number; height: number }
  return (
    <mesh position={position} rotation={[0, -Math.PI / 2, 0]} renderOrder={-1} raycast={noRaycast}>
      <planeGeometry args={[width, (width * h) / w]} />
      <meshBasicMaterial map={texture} transparent opacity={opacity} side={DoubleSide} depthWrite={false} />
    </mesh>
  )
}

function Strand(props: { track: (NetPos | null)[]; color: string; lineWidth: number; opacity: number; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const { track, color, lineWidth, opacity, onClick } = props
  const segments = useMemo(() => strandSegments(track), [track])
  return (
    <>
      {segments.map((points, k) => (
        <Line key={k} points={points} color={color} lineWidth={lineWidth} transparent opacity={opacity} onClick={onClick} />
      ))}
    </>
  )
}

function SceneLabel({ color, dim, strong, text, onClick }: { color: string; dim: boolean; strong?: boolean; text: string; onClick: () => void }) {
  return (
    <button type="button" className={`scene-label${strong ? ' strong' : ''}`} style={{ borderColor: color, color, opacity: dim ? 0.3 : 1 }} onClick={onClick}>
      {text}
    </button>
  )
}
