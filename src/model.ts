export type RelationKind = 'freund' | 'liebe' | 'verbündet' | 'misstrauen' | 'feind'

export const RELATION_COLORS: Record<RelationKind, string> = {
  freund: '#4ade80',
  liebe: '#f472b6',
  verbündet: '#60a5fa',
  misstrauen: '#f59e0b',
  feind: '#ef4444',
}

export interface Entity {
  id: string
  kind: 'person' | 'place'
  name: string
  color: string
  description: string
  /** Feste Position im Netz [u, v] – nur für Orte */
  position?: [number, number]
}

export type Change =
  | { type: 'appear'; entity: string; at: string; note?: string }
  | { type: 'move'; entity: string; to: string; note?: string }
  /** Die Figur ist in diesem Ereignis noch da, danach nicht mehr */
  | { type: 'exit'; entity: string; note?: string }
  /** kind = null beendet die Beziehung */
  | { type: 'relation'; a: string; b: string; kind: RelationKind | null; note?: string }
  | { type: 'mood'; entity: string; mood: string; note?: string }

export interface StoryEvent {
  id: string
  title: string
  description: string
  changes: Change[]
}

export interface Book {
  title: string
  entities: Entity[]
  events: StoryEvent[]
}

export interface Relation {
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

export type View = 'raum' | 'netz' | 'zeit'

export type Selection = { kind: 'entity'; id: string } | { kind: 'event'; id: string }

const relationKey = (a: string, b: string) => [a, b].sort().join('|')

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
