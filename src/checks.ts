import { bounds, covers, factTiming, findElement, involvedIds, placeChain, timeline, type Book, type Fact, type Image, type Place, type Timing } from './model'

/** Widerspruch, den das Modell erlaubt, auf den die Oberfläche aber hinweist */
export interface Hint {
  ids: string[]
  at: number
  text: string
}

/** Fehler, der ein Element oder einen Fakt unauswertbar macht (Festlegung 14: Verbote) */
export interface Problem {
  id: string
  reason: string
}

type Span = [number, number]

const overlap = ([a, b]: Span, [c, d]: Span) => Math.max(a, c) <= Math.min(b, d)
const range = ([a, b]: Span) => Array.from({ length: Math.max(0, b - a + 1) }, (_, k) => a + k)

const timingsOf = (item: { timing?: Timing; existence?: Timing; phases?: { timing: Timing; images?: Image[] }[]; images?: Image[] }) => [
  item.timing,
  item.existence,
  ...(item.phases ?? []).flatMap((p) => [p.timing, ...(p.images ?? []).map((i) => i.timing)]),
  ...(item.images ?? []).map((i) => i.timing),
]

/** Fälle, die das Modell uneindeutig machen: Zeit rückwärts, überlappende Phasen, Ort in sich selbst */
export function problems(book: Book): Problem[] {
  const found: Problem[] = []
  const items: { id: string; timing?: Timing; existence?: Timing; phases?: { timing: Timing }[] }[] = [
    ...book.persons,
    ...book.groups,
    ...book.places,
    ...book.events,
    ...book.facts,
  ]
  for (const item of items) {
    const backwards = timingsOf(item).some((t) => t && !('at' in t) && t.from && t.to && bounds(book, t)[0] > bounds(book, t)[1])
    if (backwards) found.push({ id: item.id, reason: 'Zeitangabe endet vor ihrem Beginn' })
    const spans = (item.phases ?? []).map((p) => bounds(book, p.timing))
    if (spans.some((s, i) => spans.some((t, j) => j > i && overlap(s, t)))) found.push({ id: item.id, reason: 'Phasen überschneiden sich' })
  }
  const cyclic = new Set<string>()
  timeline(book).forEach((_, i) => {
    for (const place of book.places) {
      const chain = placeChain(book, place.id, i)
      const parent = chain.length && findParent(book, chain[chain.length - 1]!, i)
      if (parent && chain.some((p) => p.id === parent)) chain.forEach((p) => cyclic.add(p.id))
    }
  })
  cyclic.forEach((id) => found.push({ id, reason: 'Ort liegt in sich selbst' }))
  return found
}

const findParent = (book: Book, place: Place, i: number) => place.phases.find((p) => covers(book, p.timing, i))?.parent

const firstOutside = (span: Span, life: Span | undefined) => (life ? range(span).find((i) => i < life[0] || i > life[1]) : undefined)

const name = (book: Book, id: string) => findElement(book, id)?.label ?? id

const existence = (book: Book, id: string) => {
  const element = findElement(book, id)?.element
  return element && 'existence' in element ? bounds(book, element.existence) : undefined
}

const factSpans = (book: Book, fact: Fact): { span: Span; causedBy?: string }[] =>
  fact.kind === 'relation' ? fact.phases.map((p) => ({ span: bounds(book, p.timing), causedBy: p.causedBy })) : [{ span: bounds(book, factTiming(book, fact)), causedBy: fact.causedBy }]

/** Erlaubte Widersprüche nach Festlegung 14, je mit beteiligten Elementen und erstem betroffenen Zeitpunkt */
export function hints(book: Book): Hint[] {
  const found: Hint[] = []
  const add = (ids: string[], at: number, text: string) => found.push({ ids, at, text })
  const last = book.timePoints.length - 1

  for (const person of book.persons) {
    const clash = range([0, last]).find((i) => {
      const own = book.facts.filter((f) => (f.kind === 'stay' || f.kind === 'journey') && f.person === person.id && covers(book, f.timing, i))
      const stays = own.filter((f) => f.kind === 'stay').length
      // Am Anfangs- und Endpunkt einer Reise darf sie sich mit einem Aufenthalt überschneiden (Festlegung 10)
      const away = own.filter((f) => f.kind === 'journey' && !bounds(book, factTiming(book, f)).includes(i)).length
      return stays > 1 || own.length - stays > 1 || (stays > 0 && away > 0)
    })
    if (clash !== undefined) add([person.id], clash, `${person.name} ist gleichzeitig an mehreren Orten oder unterwegs`)
  }

  for (const fact of book.facts) {
    for (const { span, causedBy } of factSpans(book, fact)) {
      for (const id of involvedIds(fact)) {
        const outside = firstOutside(span, existence(book, id))
        if (outside !== undefined) add([id], outside, `Fakt liegt außerhalb der Existenz von ${name(book, id)}`)
      }
      const cause = causedBy && book.events.find((e) => e.id === causedBy)
      if (cause && span[0] < bounds(book, cause.timing)[0]) add(involvedIds(fact), span[0], `Beginnt vor dem auslösenden Event „${cause.title}“`)
    }
    if (fact.kind === 'participation') participationHints(book, fact, add)
  }

  for (const event of book.events) {
    const outside = event.place ? firstOutside(bounds(book, event.timing), existence(book, event.place)) : undefined
    if (event.place && outside !== undefined) add([event.id, event.place], outside, `Event am Ort ${name(book, event.place)}, der zu der Zeit nicht existiert`)
  }

  relationHints(book, add)
  for (const place of book.places) placeHints(book, place, add)
  for (const element of [...book.persons, ...book.groups, ...book.places, ...book.events]) {
    const life = 'existence' in element ? bounds(book, element.existence) : ([0, last] as Span)
    for (const image of element.images) {
      const span = image.timing ? bounds(book, image.timing) : life
      if (span[0] < life[0] || span[1] > life[1]) add([element.id], span[0], 'Bild gilt außerhalb der Existenz seines Elements')
    }
  }
  return found
}

type Add = (ids: string[], at: number, text: string) => void

function participationHints(book: Book, fact: Extract<Fact, { kind: 'participation' }>, add: Add) {
  const event = book.events.find((e) => e.id === fact.event)
  if (!event) return
  const eventSpan = bounds(book, event.timing)
  const span = bounds(book, factTiming(book, fact))
  if (fact.timing && (span[0] < eventSpan[0] || span[1] > eventSpan[1])) add([fact.actor, event.id], span[0], `Teilnahme außerhalb der Zeit von „${event.title}“`)
  if (!event.place || findElement(book, fact.actor)?.kind !== 'person') return
  const elsewhere = range(span).find((i) => {
    const stay = book.facts.find((f) => f.kind === 'stay' && f.person === fact.actor && covers(book, f.timing, i))
    return stay?.kind === 'stay' && !placeChain(book, stay.place, i).some((p) => p.id === event.place)
  })
  if (elsewhere !== undefined) add([fact.actor, event.id], elsewhere, `${name(book, fact.actor)} ist bei „${event.title}“, aber woanders`)
}

function relationHints(book: Book, add: Add) {
  const undirected = new Set(book.relationTypes.filter((t) => !t.directed).map((t) => t.id))
  const phases = book.facts.flatMap((f) =>
    f.kind === 'relation' ? f.phases.filter((p) => undirected.has(p.type)).map((p) => ({ fact: f, type: p.type, span: bounds(book, p.timing) })) : [],
  )
  phases.forEach((a, i) =>
    phases.slice(i + 1).forEach((b) => {
      const samePair = [a.fact.from, a.fact.to].sort().join() === [b.fact.from, b.fact.to].sort().join()
      if (a.fact !== b.fact && samePair && a.type === b.type && overlap(a.span, b.span))
        add([a.fact.from, a.fact.to], Math.max(a.span[0], b.span[0]), 'Zwei gleiche ungerichtete Beziehungen überschneiden sich')
    }),
  )
}

function placeHints(book: Book, place: Place, add: Add) {
  const life = range(bounds(book, place.existence))
  const phaseAt = (i: number) => place.phases.find((p) => covers(book, p.timing, i))
  const parentAt = (i: number) => {
    const parent = phaseAt(i)?.parent
    return parent ? (findElement(book, parent)?.element as Place | undefined) : undefined
  }
  const gap = life.find((i) => !phaseAt(i))
  if (gap !== undefined) add([place.id], gap, `${place.name} hat zu dieser Zeit keine Lage`)
  const missing = life.find((i) => {
    const parent = parentAt(i)
    return parent && !covers(book, parent.existence, i)
  })
  if (missing !== undefined) add([place.id, parentAt(missing)!.id], missing, `${place.name} liegt in einem Ort, der zu der Zeit nicht existiert`)
  const beyond = life.find((i) => {
    const phase = phaseAt(i)
    const radius = parentAt(i)?.radius
    return phase && radius !== undefined && Math.hypot(phase.x, phase.y) > radius
  })
  if (beyond !== undefined) add([place.id, parentAt(beyond)!.id], beyond, `${place.name} liegt außerhalb des Radius seines Elternorts`)
  for (const phase of place.phases) {
    const span = bounds(book, phase.timing)
    for (const image of phase.images) {
      const own = image.timing ? bounds(book, image.timing) : span
      if (own[0] < span[0] || own[1] > span[1]) add([place.id], own[0], 'Bild gilt außerhalb seiner Orts-Phase')
    }
  }
}
