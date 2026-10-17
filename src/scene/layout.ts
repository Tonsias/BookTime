import { Vector3 } from 'three'
import type { Book, SliceState } from '../model'

/** Abstand zwischen zwei Ereignis-Ebenen auf der Zeitachse */
export const SLICE_SPACING = 8
/** Kantenlänge einer Ereignis-Ebene */
export const LAYER_SIZE = 22

const PERSON_RADIUS = 1.3
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
/** Wie lange ein Strang an einer Ebene gerade bleibt, bevor er sich zur nächsten biegt */
const HOLD = SLICE_SPACING * 0.3

/** Position im 2D-Netz [u, v] */
export type NetPos = [number, number]

/** Zeit läuft entlang x, das Netz liegt in der y/z-Ebene */
export const slicePoint = (slice: number, [u, v]: NetPos) => new Vector3(slice * SLICE_SPACING, v, u)

/** Positionen aller Orte und Personen im Netz */
export interface Layout {
  places: Map<string, NetPos>
  /** Position jeder Person pro Ereignis, null wenn nicht anwesend */
  persons: Map<string, (NetPos | null)[]>
}

/** Ordnet Orte fest an und Personen um ihren jeweiligen Ort, je Ereignis */
export function computeLayout(book: Book, states: SliceState[]): Layout {
  const places = new Map<string, NetPos>()
  for (const e of book.entities) if (e.kind === 'place') places.set(e.id, e.position ?? [0, 0])

  const persons = new Map<string, (NetPos | null)[]>()
  book.entities
    .filter((e) => e.kind === 'person')
    .forEach((p, i) => {
      // feste Ablage um den Ort, damit Stränge nur bei echten Änderungen springen
      const angle = i * GOLDEN_ANGLE
      const du = Math.cos(angle) * PERSON_RADIUS
      const dv = Math.sin(angle) * PERSON_RADIUS
      persons.set(
        p.id,
        states.map((s) => {
          const place = places.get(s.location[p.id])
          return place ? [place[0] + du, place[1] + dv] : null
        }),
      )
    })

  return { places, persons }
}

const TRANSITION_STEPS = 16
const smoothstep = (t: number) => t * t * (3 - 2 * t)

/**
 * Strangsegmente: an jeder Ebene gerade, dazwischen eine weiche S-Kurve zur neuen Position.
 * Lücken (nicht anwesend) trennen Segmente.
 */
export function strandSegments(track: (NetPos | null)[]): Vector3[][] {
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
