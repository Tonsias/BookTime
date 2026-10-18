import { Vector3 } from 'three'
import { covers, factsAt, worldPosition, type Book, type Place } from '../model'

/** Abstand zwischen zwei Zeitpunkt-Ebenen auf der Zeitachse */
export const SLICE_SPACING = 8
/** Kantenlänge einer Zeitpunkt-Ebene */
export const LAYER_SIZE = 22

const DEFAULT_RING = 2.1
const PERSON_RADIUS = 1.3
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
/** Wie lange ein Strang an einer Ebene gerade bleibt, bevor er sich zur nächsten biegt */
const HOLD = SLICE_SPACING * 0.3

/** Position im 2D-Netz [u, v] */
export type NetPos = [number, number]

/** Spur über alle Zeitpunkte, null wenn nicht vorhanden */
type Track = (NetPos | null)[]

/** Zeit läuft entlang x, das Netz liegt in der y/z-Ebene */
export const slicePoint = (slice: number, [u, v]: NetPos) => new Vector3(slice * SLICE_SPACING, v, u)

/** Innenradius des Rings eines Ortes */
export const ringRadius = (place: Place) => place.radius ?? DEFAULT_RING

/** Positionen aller Orte und Personen im Netz, je Zeitpunkt */
export interface Layout {
  places: Map<string, Track>
  persons: Map<string, Track>
}

/** Orte an ihrer Weltposition; Personen um ihren Ort bzw. auf halber Strecke ihrer Reise */
export function computeLayout(book: Book, count: number): Layout {
  const slices = Array.from({ length: count }, (_, i) => i)
  const places = new Map<string, Track>()
  for (const place of book.places) {
    places.set(
      place.id,
      slices.map((i) => {
        const pos = covers(book, place.existence, i) ? worldPosition(book, place.id, i) : undefined
        return pos ? [pos.x, pos.y] : null
      }),
    )
  }

  const facts = slices.map((i) => factsAt(book, i))
  const persons = new Map<string, Track>()
  book.persons.forEach((person, n) => {
    // feste Ablage um den Ort, damit Stränge nur bei echten Änderungen springen
    const angle = n * GOLDEN_ANGLE
    persons.set(
      person.id,
      slices.map((i) => {
        const at = (id: string) => places.get(id)?.[i]
        const stay = facts[i].find((f) => f.kind === 'stay' && f.person === person.id)
        if (stay?.kind === 'stay') {
          const center = at(stay.place)
          const ring = ringRadius(book.places.find((p) => p.id === stay.place)!)
          const r = Math.min(PERSON_RADIUS, ring * 0.6)
          return center ? [center[0] + Math.cos(angle) * r, center[1] + Math.sin(angle) * r] : null
        }
        const journey = facts[i].find((f) => f.kind === 'journey' && f.person === person.id)
        if (journey?.kind !== 'journey') return null
        const [a, b] = [at(journey.origin), at(journey.destination)]
        return a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : null
      }),
    )
  })

  return { places, persons }
}

const TRANSITION_STEPS = 16
const smoothstep = (t: number) => t * t * (3 - 2 * t)

/**
 * Strangsegmente: an jeder Ebene gerade, dazwischen eine weiche S-Kurve zur neuen Position.
 * Lücken (nicht vorhanden) trennen Segmente.
 */
export function strandSegments(track: Track): Vector3[][] {
  const segments: Vector3[][] = []
  let points: Vector3[] = []
  const flush = () => {
    if (points.length >= 2) segments.push(points)
    points = []
  }

  track.forEach((pos, i) => {
    if (!pos) return flush()
    const b = slicePoint(i, pos)
    const a = points.at(-1)
    if (a) {
      for (let s = 0; s <= TRANSITION_STEPS; s++) {
        const t = s / TRANSITION_STEPS
        const k = smoothstep(t)
        points.push(new Vector3(a.x + HOLD + t * (b.x - a.x - 2 * HOLD), a.y + k * (b.y - a.y), a.z + k * (b.z - a.z)))
      }
    }
    points.push(b)
  })
  flush()
  return segments
}
