import type { Scope } from '../edit/ops'
import { covers, factsAt, findElement, type Book } from '../model'
import { ringRadius, type Layout, type NetPos } from './layout'

/** Etwas, das man auf der aktuellen Ebene anfassen oder treffen kann */
export interface Target {
  kind: 'person' | 'event' | 'place'
  id: string
}

const NEAR = 0.6
const BAND = 0.45

const distance = (a: NetPos, b: NetPos) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** Mittelpunkt eines Elements auf Ebene i im Netz */
export function positionOf(book: Book, layout: Layout, i: number, target: Target): NetPos | undefined {
  if (target.kind === 'person') return layout.persons.get(target.id)?.[i] ?? undefined
  if (target.kind === 'place') return layout.places.get(target.id)?.[i] ?? undefined
  const event = book.events.find((e) => e.id === target.id)
  return event?.place && covers(book, event.timing, i) ? (layout.places.get(event.place)?.[i] ?? undefined) : undefined
}

/**
 * Element unter einem Netzpunkt (Festlegung 58): erst Personen, dann Events, dann Orte.
 * `ring` trifft Orte nur am Ring (zum Anfassen, damit die Kamera im Inneren frei bleibt), `inside` überall im Ring (als Ziel).
 */
export function hitAt(book: Book, layout: Layout, i: number, point: NetPos, ring: 'ring' | 'inside', skip?: string): Target | undefined {
  const near = (kind: Target['kind'], ids: string[]) =>
    ids
      .map((id) => ({ kind, id, pos: positionOf(book, layout, i, { kind, id }) }))
      .filter((t) => t.id !== skip && t.pos && distance(t.pos, point) < NEAR)
      .sort((a, b) => distance(a.pos!, point) - distance(b.pos!, point))[0]
  const hit = near('person', book.persons.map((p) => p.id)) ?? near('event', book.events.map((e) => e.id))
  if (hit) return { kind: hit.kind, id: hit.id }
  const place = book.places
    .filter((p) => p.id !== skip)
    .map((p) => ({ p, pos: layout.places.get(p.id)?.[i], r: ringRadius(p) }))
    .filter(({ pos, r }) => pos && (ring === 'ring' ? Math.abs(distance(pos, point) - r) < BAND : distance(pos, point) < r))
    .sort((a, b) => a.r - b.r)[0]
  return place && { kind: 'place', id: place.p.id }
}

/** Was beim Loslassen von `source` auf `target` entsteht */
export type DropKind = 'stay' | 'relation' | 'participation' | 'event-place'

/** Wirkung und Etikett am Zeiger, z. B. „Anna → Velmar: Aufenthalt ab 5“; ohne Wirkung undefined */
export function describeDrop(book: Book, i: number, scope: Scope, source: Target, target: Target | undefined): { kind: DropKind; text: string } | undefined {
  if (!target) return undefined
  const name = (id: string) => findElement(book, id)?.label ?? id
  const [a, b] = [name(source.id), name(target.id)]
  if (source.kind === 'person' && target.kind === 'place') {
    const here = factsAt(book, i).some((f) => f.kind === 'stay' && f.person === source.id && f.place === target.id)
    return here ? undefined : { kind: 'stay', text: `${a} → ${b}: Aufenthalt ${scope === 'hier' ? `ab ${i + 1}` : 'ganze Phase'}` }
  }
  if (source.kind === 'person' && target.kind === 'person') return { kind: 'relation', text: `${a} → ${b}: Beziehung ab ${i + 1}, Art wählen …` }
  if (source.kind === 'person' && target.kind === 'event') {
    const joined = book.facts.some((f) => f.kind === 'participation' && f.actor === source.id && f.event === target.id)
    return joined ? undefined : { kind: 'participation', text: `${a} nimmt teil an „${b}“` }
  }
  if (source.kind === 'event' && target.kind === 'place') return { kind: 'event-place', text: `„${a}“ findet in ${b} statt` }
  return undefined
}
