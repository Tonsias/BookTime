/** Art einer Beziehung zwischen zwei Personen */
export type RelationKind = 'freund' | 'liebe' | 'verbündet' | 'misstrauen' | 'feind'

/** Farbe jeder Beziehungsart in Szene und Legende */
export const RELATION_COLORS: Record<RelationKind, string> = {
  freund: '#4ade80',
  liebe: '#f472b6',
  verbündet: '#60a5fa',
  misstrauen: '#f59e0b',
  feind: '#ef4444',
}

/** Person oder Ort der Geschichte */
export interface Entity {
  id: string
  kind: 'person' | 'place'
  name: string
  color: string
  description: string
  /** Feste Position im Netz [u, v] – nur für Orte */
  position?: [number, number]
}

/** Eine Änderung, die ein Ereignis an der Welt vornimmt */
export type Change =
  | { type: 'appear'; entity: string; at: string; note?: string }
  | { type: 'move'; entity: string; to: string; note?: string }
  /** Die Figur ist in diesem Ereignis noch da, danach nicht mehr */
  | { type: 'exit'; entity: string; note?: string }
  /** kind = null beendet die Beziehung */
  | { type: 'relation'; a: string; b: string; kind: RelationKind | null; note?: string }
  | { type: 'mood'; entity: string; mood: string; note?: string }

interface StoryEvent {
  id: string
  title: string
  description: string
  changes: Change[]
}

/** Ein ganzes Buch: alle Elemente und die Ereignisse in zeitlicher Reihenfolge */
export interface Book {
  title: string
  entities: Entity[]
  events: StoryEvent[]
}

interface Relation {
  a: string
  b: string
  kind: RelationKind
}

/** Zustand der Welt nach einem Ereignis */
export interface SliceState {
  location: Record<string, string>
  mood: Record<string, string>
  relations: Relation[]
  exiting: string[]
}

/** Kamera-Ansicht der 3D-Szene */
export type View = 'raum' | 'netz' | 'zeit'

/** Aktuell ausgewähltes Element oder Ereignis */
export type Selection = { kind: 'entity'; id: string } | { kind: 'event'; id: string }

const relationKey = (a: string, b: string) => [a, b].sort().join('|')

/** Wendet die Änderungen aller Ereignisse nacheinander an und liefert den Zustand nach jedem Ereignis */
export function computeStates(book: Book): SliceState[] {
  const location: Record<string, string> = {}
  const mood: Record<string, string> = {}
  const relations = new Map<string, Relation>()
  let exiting: string[] = []

  return book.events.map((event) => {
    for (const id of exiting) {
      delete location[id]
      for (const [key, r] of relations) {
        if (r.a === id || r.b === id) relations.delete(key)
      }
    }
    exiting = []

    for (const c of event.changes) {
      switch (c.type) {
        case 'appear':
          location[c.entity] = c.at
          break
        case 'move':
          location[c.entity] = c.to
          break
        case 'exit':
          exiting.push(c.entity)
          break
        case 'mood':
          mood[c.entity] = c.mood
          break
        case 'relation': {
          const key = relationKey(c.a, c.b)
          if (c.kind) relations.set(key, { a: c.a, b: c.b, kind: c.kind })
          else relations.delete(key)
          break
        }
      }
    }

    return { location: { ...location }, mood: { ...mood }, relations: [...relations.values()], exiting: [...exiting] }
  })
}

/** IDs aller Elemente, die eine Änderung betrifft */
export function involvedIds(c: Change): string[] {
  switch (c.type) {
    case 'appear':
      return [c.entity, c.at]
    case 'move':
      return [c.entity, c.to]
    case 'relation':
      return [c.a, c.b]
    default:
      return [c.entity]
  }
}

/** Alle Elemente, die mit der Auswahl irgendwann verbunden sind */
export function focusSet(book: Book, states: SliceState[], selection: Selection | null): Set<string> | null {
  if (!selection) return null
  const ids = new Set<string>()

  if (selection.kind === 'event') {
    book.events.find((e) => e.id === selection.id)?.changes.forEach((c) => involvedIds(c).forEach((id) => ids.add(id)))
    return ids
  }

  const id = selection.id
  ids.add(id)
  for (const s of states) {
    for (const [person, place] of Object.entries(s.location)) {
      if (person === id) ids.add(place)
      if (place === id) ids.add(person)
    }
    for (const r of s.relations) {
      if (r.a === id) ids.add(r.b)
      if (r.b === id) ids.add(r.a)
    }
  }
  return ids
}
