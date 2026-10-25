import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { CameraControls, Edges, Line, useTexture } from '@react-three/drei'
import { DoubleSide, Group, Plane, Quaternion, SRGBColorSpace, Vector3 } from 'three'
import { backgroundAt, covers, elementColor, factsAt, phaseAt, type Book, type Selection, type TimePoint, type View } from '../model'
import { LAYER_SIZE, SLICE_SPACING, ringRadius, slicePoint, strandSegments, type Layout, type NetPos } from './layout'

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

const setCursor = (pointer: boolean) => () => {
  document.body.style.cursor = pointer ? 'pointer' : ''
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
        <Layer key={points[i].id} index={i} title={points[i].name} active={i === current} opacity={sliceOpacity(i)} onJump={onJump} />
      ))}
      {visible.map((i) => {
        const background = backgroundAt(book, i)
        if (!background || view === 'zeit' || (view === 'netz' && i !== current)) return null
        const { file, x, y, width } = background
        return <Backdrop key={i} file={file} imageUrl={imageUrl} position={slicePoint(i, [x, y])} width={width} opacity={i === current ? 0.4 : 0.12} />
      })}

      {book.places.map((place) => (
        <Track
          key={place.id}
          track={layout.places.get(place.id)!}
          color={color(place.id)}
          lineWidth={1}
          lineOpacity={0.25 * emphasis(place.id)}
          visible={visible}
          onClick={select('place', place.id)}
          marker={(i) => (
            <mesh rotation={[0, Math.PI / 2, 0]}>
              <ringGeometry args={[ringRadius(place), ringRadius(place) + (i === current ? 0.3 : 0.15), 64]} />
              <meshBasicMaterial color={color(place.id)} transparent opacity={emphasis(place.id) * sliceOpacity(i) * (i === current ? 0.9 : 0.5)} side={DoubleSide} depthWrite={false} />
            </mesh>
          )}
        />
      ))}

      {book.persons.map((person) => (
        <Track
          key={person.id}
          track={layout.persons.get(person.id)!}
          color={color(person.id)}
          lineWidth={person.id === selectedId ? 5 : 2.5}
          lineOpacity={(view === 'netz' ? 0.35 : 0.85) * emphasis(person.id)}
          visible={visible}
          onClick={select('person', person.id)}
          marker={(i) => (
            <mesh>
              <sphereGeometry args={[i === current ? 0.45 : 0.28, 24, 24]} />
              <meshStandardMaterial color={color(person.id)} emissive={color(person.id)} emissiveIntensity={0.35} transparent opacity={emphasis(person.id) * sliceOpacity(i)} />
            </mesh>
          )}
        />
      ))}

      {book.events.map((event) =>
        visible.map((i) => {
          const pos = event.place && covers(book, event.timing, i) ? layout.places.get(event.place)?.[i] : null
          if (!pos) return null
          return (
            <mesh key={`${event.id}-${i}`} position={slicePoint(i, pos)} onClick={select('event', event.id)} onPointerOver={setCursor(true)} onPointerOut={setCursor(false)}>
              <octahedronGeometry args={[i === current ? 0.5 : 0.32]} />
              <meshStandardMaterial color={event.color} emissive={event.color} emissiveIntensity={0.4} transparent opacity={emphasis(event.id) * sliceOpacity(i)} />
            </mesh>
          )
        }),
      )}

      {visible.map((i) =>
        factsAt(book, i).map((fact) => {
          if (fact.kind !== 'relation') return null
          const phase = phaseAt(book, fact.phases, i)
          const type = book.relationTypes.find((t) => t.id === phase?.type)
          const a = layout.persons.get(fact.from)?.[i]
          const b = layout.persons.get(fact.to)?.[i]
          if (!phase || !type || !a || !b) return null
          const involvesSelected = fact.from === selectedId || fact.to === selectedId
          const relEmphasis = !focus || involvesSelected ? 1 : focus.has(fact.from) && focus.has(fact.to) ? 0.3 : 0.08
          const opacity = sliceOpacity(i) * relEmphasis
          return (
            <group key={`${i}-${fact.id}`}>
              <Line
                points={[slicePoint(i, a), slicePoint(i, b)]}
                color={type.color}
                lineWidth={phase.strength * (i === current ? 0.8 : 0.5) + 0.5}
                transparent
                opacity={opacity}
                raycast={noRaycast}
              />
              {type.directed && <Arrowhead from={slicePoint(i, a)} to={slicePoint(i, b)} color={type.color} opacity={opacity} />}
            </group>
          )
        }),
      )}

      {/* Beschriftungen nur auf der aktuellen Ebene */}
      {book.places.map((place) => {
        const pos = layout.places.get(place.id)![current]
        if (!pos) return null
        // Unterorte oben beschriften, sonst überdeckt ihr Label das des Elternorts
        const above = !!phaseAt(book, place.phases, current)?.parent
        return (
          <Label
            key={place.id}
            position={slicePoint(current, [pos[0], pos[1] + (above ? 1 : -1) * (ringRadius(place) + 0.5)])}
            color={color(place.id)}
            dim={emphasis(place.id) < 0.5}
            onClick={() => onSelect({ kind: 'place', id: place.id })}
          >
            {place.name}
          </Label>
        )
      })}
      {book.persons.map((person) => {
        const pos = layout.persons.get(person.id)![current]
        if (!pos) return null
        return (
          <Label
            key={person.id}
            position={slicePoint(current, [pos[0], pos[1] + 0.9])}
            color={color(person.id)}
            dim={emphasis(person.id) < 0.5}
            strong
            onClick={() => onSelect({ kind: 'person', id: person.id })}
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
      <Html position={[0, LAYER_SIZE / 2 + 1, 0]} opacity={opacity}>
        <button type="button" className={`layer-label${active ? ' active' : ''}`} onClick={() => onJump(index)}>
          {index + 1}. {title}
        </button>
      </Html>
    </group>
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

function Track(props: {
  track: (NetPos | null)[]
  color: string
  lineWidth: number
  lineOpacity: number
  visible: number[]
  onClick: (e: ThreeEvent<MouseEvent>) => void
  marker: (i: number) => React.ReactNode
}) {
  const { track, color, lineWidth, lineOpacity, visible, onClick, marker } = props
  const segments = useMemo(() => strandSegments(track), [track])
  return (
    <>
      {segments.map((points, k) => (
        <Line key={k} points={points} color={color} lineWidth={lineWidth} transparent opacity={lineOpacity} onClick={onClick} />
      ))}
      {visible.map((i) => {
        const pos = track[i]
        return pos ? (
          <group key={i} position={slicePoint(i, pos)} onClick={onClick} onPointerOver={setCursor(true)} onPointerOut={setCursor(false)}>
            {marker(i)}
          </group>
        ) : null
      })}
    </>
  )
}

function Arrowhead({ from, to, color, opacity }: { from: Vector3; to: Vector3; color: string; opacity: number }) {
  const dir = to.clone().sub(from).normalize()
  const position = to.clone().sub(dir.clone().multiplyScalar(0.75))
  return (
    <mesh position={position} quaternion={new Quaternion().setFromUnitVectors(UP, dir)} raycast={noRaycast}>
      <coneGeometry args={[0.16, 0.45, 12]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  )
}

function Label(props: { position: Vector3; color: string; dim: boolean; strong?: boolean; onClick: () => void; children: React.ReactNode }) {
  const { position, color, dim, strong, onClick, children } = props
  return (
    <Html position={position}>
      <button type="button" className={`scene-label${strong ? ' strong' : ''}`} style={{ borderColor: color, color, opacity: dim ? 0.3 : 1 }} onClick={onClick}>
        {children}
      </button>
    </Html>
  )
}

const projected = new Vector3()

/** Wie drei-Html, baut sein React-Root aber erst nach dem Commit ab – synchrones unmount löst eine React-Warnung aus */
function Html({ position, opacity = 1, children }: { position: Vector3 | [number, number, number]; opacity?: number; children: ReactNode }) {
  const group = useRef<Group>(null)
  const { gl, camera, size } = useThree()
  const el = useRef<HTMLDivElement | null>(null)
  const root = useRef<Root | null>(null)

  useLayoutEffect(() => {
    const target = gl.domElement.parentNode!
    const div = document.createElement('div')
    div.style.cssText = 'position:absolute;top:0;left:0;'
    target.appendChild(div)
    el.current = div
    const current = (root.current = createRoot(div))
    return () => {
      target.removeChild(div)
      el.current = root.current = null
      setTimeout(() => current.unmount())
    }
  }, [gl])

  useLayoutEffect(() => {
    root.current?.render(<div style={{ transform: 'translate3d(-50%,-50%,0)', opacity }}>{children}</div>)
  })

  useFrame(() => {
    const div = el.current
    if (!group.current || !div) return
    group.current.getWorldPosition(projected).project(camera)
    div.style.display = projected.z > 1 ? 'none' : ''
    div.style.zIndex = String(Math.round((1 - projected.z) * 5))
    div.style.transform = `translate3d(${((projected.x + 1) / 2) * size.width}px,${((1 - projected.y) / 2) * size.height}px,0)`
  })

  return <group ref={group} position={position} />
}
