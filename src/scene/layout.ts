import { Vector3 } from 'three'
import { covers, factsAt, worldPosition, type Book, type Place } from '../model'

/** Abstand zwischen zwei Zeitpunkt-Ebenen auf der Zeitachse */
export const SLICE_SPACING = 8

const DEFAULT_RING = 2.1
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

/** Orte an ihrer Weltposition; Personen gleichmäßig um ihren Ort bzw. auf halber Strecke ihrer Reise */
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
  const persons = new Map<string, Track>(book.persons.map((person) => [person.id, slices.map(() => null)]))
  slices.forEach((i) => {
    const at = (id: string) => places.get(id)?.[i]
    const residents = new Map<string, string[]>()
    for (const fact of facts[i] ?? []) {
      if (fact.kind === 'stay') residents.set(fact.place, [...(residents.get(fact.place) ?? []), fact.person])
      if (fact.kind !== 'journey') continue
      const [a, b] = [at(fact.origin), at(fact.destination)]
      const track = persons.get(fact.person)
      if (a && b && track) track[i] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    }
    // Gleichmäßig um den Ort nach ID-Reihenfolge, damit sich niemand überdeckt
    for (const [placeId, ids] of residents) {
      const center = at(placeId)
      const place = book.places.find((p) => p.id === placeId)
      if (!center || !place) continue
      const r = ringRadius(place) * 0.6
      ids.sort((a, b) => a.localeCompare(b))
      ids.forEach((id, n) => {
        const angle = Math.PI / 2 + (n * 2 * Math.PI) / ids.length
        const track = persons.get(id)
        if (track) track[i] = [center[0] + Math.cos(angle) * r, center[1] + Math.sin(angle) * r]
      })
    }
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
