/** Zeitpunkt (`at`) oder Zeitspanne; fehlendes from/to = Anfang/Ende der Geschichte, Grenzen eingeschlossen */
export type Timing = { at: string } | { from?: string; to?: string }

/** Hintergrundbild einer Zeitebene, Mittelpunkt und Breite in Weltkoordinaten */
interface Background {
  id: string
  file: string
  x: number
  y: number
  width: number
  note?: string
}

/** Benannter Punkt in der Geschichte */
export interface TimePoint {
  id: string
  name: string
  dateLabel?: string
  order: number
  background?: Background
  note?: string
}

/** Bild eines Elements, ohne timing immer gültig */
export interface Image {
  id: string
  file: string
  order: number
  timing?: Timing
  note?: string
}

interface Element {
  id: string
  description: string
  color: string
  images: Image[]
  note?: string
}

interface Named extends Element {
  name: string
  existence: Timing
}

type Person = Named

type Group = Named

/** Lage eines Ortes während einer Zeitspanne, x/y relativ zum Elternort */
interface PlacePhase {
  id: string
  timing: Timing
  parent?: string
  x: number
  y: number
  images: Image[]
  note?: string
}

/** Ort mit zeitlich veränderlicher Lage */
export interface Place extends Named {
  radius?: number
  phases: PlacePhase[]
}

/** Ereignis an einem Ort mit Ergebnis */
export interface StoryEvent extends Element {
  title: string
  timing: Timing
  place?: string
  result: string
}

interface RelationType {
  id: string
  name: string
  category: string
  directed: boolean
  inverseName?: string
  color: string
  note?: string
}

/** Abschnitt einer Beziehung mit Art und Stärke */
export interface RelationPhase {
  id: string
  timing: Timing
  type: string
  strength: 1 | 2 | 3 | 4 | 5
  causedBy?: string
  note?: string
}

interface TimedFact {
  id: string
  timing: Timing
  causedBy?: string
  note?: string
}

/** Beziehung zwischen zwei Personen oder Gruppen; gilt nur innerhalb ihrer Phasen */
export interface Relation {
  kind: 'relation'
  id: string
  from: string
  to: string
  phases: RelationPhase[]
  note?: string
}

interface Stay extends TimedFact {
  kind: 'stay'
  person: string
  place: string
}

interface Journey extends TimedFact {
  kind: 'journey'
  person: string
  origin: string
  destination: string
}

/** Person oder Gruppe nimmt an einem Event teil; ohne timing gilt die Event-Zeit */
interface Participation extends Omit<TimedFact, 'timing'> {
  kind: 'participation'
  actor: string
  event: string
  role?: string
  timing?: Timing
}

interface Membership extends TimedFact {
  kind: 'membership'
  person: string
  group: string
  role?: string
}

/** Zeitlich begrenzte Aussage, die Elemente verbindet */
export type Fact = Relation | Stay | Journey | Participation | Membership

/** Ein ganzes Buch */
export interface Book {
  title: string
  note?: string
  timePoints: TimePoint[]
  persons: Person[]
  groups: Group[]
  places: Place[]
  events: StoryEvent[]
  relationTypes: RelationType[]
  facts: Fact[]
}

/** Art eines auswählbaren Elements */
export type ElementKind = 'person' | 'group' | 'place' | 'event'

/** Kamera-Ansicht der 3D-Szene */
export type View = 'raum' | 'netz' | 'zeit'

/** Aktuell ausgewähltes Element */
export interface Selection {
  kind: ElementKind
  id: string
}

const indexCache = new WeakMap<Book, Map<string, number>>()

/** Zeitpunkte in chronologischer Reihenfolge */
export const timeline = (book: Book) => [...book.timePoints].sort((a, b) => a.order - b.order)

const timeIndex = (book: Book) => {
  let index = indexCache.get(book)
  if (!index) {
    index = new Map(timeline(book).map((t, i) => [t.id, i]))
    indexCache.set(book, index)
  }
  return index
}

/** Erster und letzter Index (in `timeline`), die eine Zeitangabe einschließt */
export function bounds(book: Book, timing: Timing): [number, number] {
  const index = timeIndex(book)
  if ('at' in timing) {
    const i = index.get(timing.at) ?? -1
    return [i, i]
  }
  return [timing.from ? (index.get(timing.from) ?? 0) : 0, timing.to ? (index.get(timing.to) ?? -1) : index.size - 1]
}

/** Gilt die Zeitangabe zum Zeitpunkt mit Index i? */
export function covers(book: Book, timing: Timing, i: number) {
  const [start, end] = bounds(book, timing)
  return start <= i && i <= end
}

/** Zeit eines Fakts; eine Relation reicht von ihrer ersten bis zur letzten Phase */
export function factTiming(book: Book, fact: Fact): Timing {
  if (fact.kind === 'participation') return fact.timing ?? book.events.find((e) => e.id === fact.event)?.timing ?? {}
  if (fact.kind !== 'relation') return fact.timing
  const spans = fact.phases.map((p) => bounds(book, p.timing))
  const points = timeline(book)
  return { from: points[Math.min(...spans.map((s) => s[0]))]?.id, to: points[Math.max(...spans.map((s) => s[1]))]?.id }
}

/** Die zum Index i gültige Phase */
export const phaseAt = <T extends { timing: Timing }>(book: Book, phases: T[], i: number) => phases.find((p) => covers(book, p.timing, i))

/** Alle Fakten, die zum Zeitpunkt mit Index i gelten */
export function factsAt(book: Book, i: number): Fact[] {
  return book.facts.filter((f) => (f.kind === 'relation' ? !!phaseAt(book, f.phases, i) : covers(book, factTiming(book, f), i)))
}

/** IDs aller Elemente, die ein Fakt verbindet */
export function involvedIds(fact: Fact): string[] {
  switch (fact.kind) {
    case 'relation':
      return [fact.from, fact.to]
    case 'stay':
      return [fact.person, fact.place]
    case 'journey':
      return [fact.person, fact.origin, fact.destination]
    case 'participation':
      return [fact.actor, fact.event]
    case 'membership':
      return [fact.person, fact.group]
  }
}

/** Element mit seiner Art und Anzeigenamen, gesucht über die ID */
export function findElement(book: Book, id: string): { kind: ElementKind; label: string; element: Named | StoryEvent } | undefined {
  const lists: [ElementKind, Named[]][] = [
    ['person', book.persons],
    ['group', book.groups],
    ['place', book.places],
  ]
  for (const [kind, list] of lists) {
    const element = list.find((e) => e.id === id)
    if (element) return { kind, label: element.name, element }
  }
  const event = book.events.find((e) => e.id === id)
  if (event) return { kind: 'event', label: event.title, element: event }
}

/** Ort selbst und alle Elternorte zum Index i, innen nach außen */
export function placeChain(book: Book, placeId: string, i: number): Place[] {
  const chain: Place[] = []
  let place = book.places.find((p) => p.id === placeId)
  while (place && !chain.includes(place)) {
    chain.push(place)
    const parent = phaseAt(book, place.phases, i)?.parent
    place = parent ? book.places.find((p) => p.id === parent) : undefined
  }
  return chain
}

/** Weltposition eines Ortes zum Index i: eigene Position plus die aller Elternorte */
export function worldPosition(book: Book, placeId: string, i: number): { x: number; y: number } | undefined {
  let x = 0
  let y = 0
  for (const place of placeChain(book, placeId, i)) {
    const phase = phaseAt(book, place.phases, i)
    if (!phase) return undefined
    x += phase.x
    y += phase.y
  }
  return { x, y }
}

const firstValid = (book: Book, images: Image[], i: number) =>
  [...images].sort((a, b) => a.order - b.order).find((img) => !img.timing || covers(book, img.timing, i))

/** Erstes zum Index i gültige Bild eines Elements; bei Orten zuerst das der aktuellen Phase */
export function imageAt(book: Book, owner: string, i: number): Image | undefined {
  const found = findElement(book, owner)
  if (!found) return undefined
  if (found.kind === 'place') {
    const phase = phaseAt(book, (found.element as Place).phases, i)
    const fromPhase = phase && firstValid(book, phase.images, i)
    if (fromPhase) return fromPhase
  }
  return firstValid(book, found.element.images, i)
}

/** Hintergrund zum Index i: der eigene oder der des nächsten früheren Zeitpunkts mit Hintergrund */
export const backgroundAt = (book: Book, i: number) =>
  timeline(book)
    .slice(0, i + 1)
    .findLast((t) => t.background)?.background

/** Alle Elemente, die mit der Auswahl irgendwann verbunden sind */
export function focusSet(book: Book, selection: Selection | null): Set<string> | null {
  if (!selection) return null
  const ids = new Set([selection.id])
  for (const fact of book.facts) {
    const involved = involvedIds(fact)
    if (involved.includes(selection.id)) involved.forEach((id) => ids.add(id))
  }
  const event = book.events.find((e) => e.id === selection.id)
  if (event?.place) ids.add(event.place)
  return ids
}

/** Farbe eines Elements, gesucht über die ID */
export const elementColor = (book: Book, id: string) => findElement(book, id)?.element.color ?? '#888888'
