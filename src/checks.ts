import { calendarMismatch, calendarOf, compareDates, dateError, formatDate } from './calendar'
import { bounds, covers, factLabel, factTiming, findElement, involvedIds, layerAt, onLayer, placeChain, spanLabel, timeline, worldPosition, type Book, type Fact, type Image, type Place, type Timing } from './model'

/** Art eines Hinweises; mit den beteiligten IDs ein stabiler Schlüssel */
export type HintRule =
  | 'clash'
  | 'outside-existence'
  | 'before-cause'
  | 'participation-time'
  | 'elsewhere'
  | 'event-place'
  | 'relation-overlap'
  | 'place-gap'
  | 'parent-missing'
  | 'outside-radius'
  | 'outside-layer'
  | 'image-time'
  | 'image-missing'
  | 'date-order'
  | 'date-calendar'

/** Widerspruch, den das Modell erlaubt, auf den die Oberfläche aber hinweist */
export interface Hint {
  rule: HintRule
  /** Beteiligte Fakten, Phasen, Bilder oder Elemente */
  ids: string[]
  /** Elemente, bei denen der Hinweis erscheint */
  els: string[]
  at: number
  text: string
}

/** Schlüssel, über den ein Hinweis als gewollt markiert wird */
export const hintKey = (hint: { rule: string; ids: string[] }) => `${hint.rule}:${hint.ids.join(',')}`

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
  for (const { id, date } of datesOf(book)) {
    const reason = dateError(date)
    if (reason) found.push({ id, reason })
  }
  return found
}

const findParent = (book: Book, place: Place, i: number) => place.phases.find((p) => covers(book, p.timing, i))?.parent

const firstOutside = (span: Span, life: Span | undefined) => (life ? range(span).find((i) => i < life[0] || i > life[1]) : undefined)

const name = (book: Book, id: string) => findElement(book, id)?.label ?? id

const existence = (book: Book, id: string) => {
  const element = findElement(book, id)?.element
  return element && 'existence' in element ? bounds(book, element.existence) : undefined
}

type Add = (rule: HintRule, ids: string[], els: string[], at: number, text: string) => void

/** Erlaubte Widersprüche nach Festlegung 14, auch die als gewollt markierten; mit `available` auch fehlende Bilder */
export function hints(book: Book, available?: string[]): Hint[] {
  const found: Hint[] = []
  const add: Add = (rule, ids, els, at, text) => found.push({ rule, ids, els, at, text })
  for (const person of book.persons) clashHints(book, person.id, add)
  for (const fact of book.facts) factHints(book, fact, add)
  for (const event of book.events) {
    const span = bounds(book, event.timing)
    const life = event.place ? existence(book, event.place) : undefined
    const outside = firstOutside(span, life)
    if (event.place && life && outside !== undefined)
      add('event-place', [event.id], [event.id, event.place], outside, `„${event.title}“ (${spanLabel(book, span)}) findet in ${name(book, event.place)} statt, das ${spanLabel(book, life)} existiert`)
  }
  relationHints(book, add)
  for (const place of book.places) placeHints(book, place, add)
  imageHints(book, add)
  dateHints(book, add)
  if (available) missingImages(book, new Set(available), add)
  return found.sort((a, b) => a.at - b.at)
}

/** Hinweise ohne die als gewollt markierten */
export function openHints(book: Book, available?: string[]) {
  const accepted = new Set(book.acceptedHints.map(hintKey))
  return hints(book, available).filter((h) => !accepted.has(hintKey(h)))
}

type Move = Extract<Fact, { kind: 'stay' | 'journey' }>

const isMove = (fact: Fact): fact is Move => fact.kind === 'stay' || fact.kind === 'journey'

function clashHints(book: Book, person: string, add: Add) {
  const own = book.facts.filter(isMove).filter((f) => f.person === person)
  const where = (f: Move) => (f.kind === 'stay' ? `in ${name(book, f.place)}` : `unterwegs nach ${name(book, f.destination)}`)
  // Am Anfangs- und Endpunkt einer Reise darf sie sich mit einem Aufenthalt überschneiden (Festlegung 10)
  const endpoint = (f: Move, i: number) => f.kind === 'journey' && bounds(book, f.timing).includes(i)
  own.forEach((f, k) =>
    own.slice(k + 1).forEach((g) => {
      const [a, b] = [bounds(book, f.timing), bounds(book, g.timing)]
      const both = range([Math.max(a[0], b[0]), Math.min(a[1], b[1])]).filter((i) => f.kind === g.kind || !(endpoint(f, i) || endpoint(g, i)))
      if (!both.length) return
      const [first, second] = a[0] <= b[0] ? [f, g] : [g, f]
      add('clash', [first.id, second.id], [person], both[0]!, `${name(book, person)} ist gleichzeitig ${where(first)} und ${where(second)} (${spanLabel(book, [both[0]!, both.at(-1)!])})`)
    }),
  )
}

function factHints(book: Book, fact: Fact, add: Add) {
  const spans =
    fact.kind === 'relation'
      ? fact.phases.map((p) => ({ id: p.id, span: bounds(book, p.timing), causedBy: p.causedBy, label: factLabel(book, fact, p) }))
      : [{ id: fact.id, span: bounds(book, factTiming(book, fact)), causedBy: fact.causedBy, label: factLabel(book, fact) }]
  for (const { id, span, causedBy, label } of spans) {
    for (const element of involvedIds(fact)) {
      const life = existence(book, element)
      const outside = firstOutside(span, life)
      if (life && outside !== undefined) add('outside-existence', [id, element], [element], outside, `${label} (${spanLabel(book, span)}) liegt außerhalb der Existenz von ${name(book, element)} (${spanLabel(book, life)})`)
    }
    const cause = causedBy && book.events.find((e) => e.id === causedBy)
    if (cause && span[0] < bounds(book, cause.timing)[0]) add('before-cause', [id, cause.id], involvedIds(fact), span[0], `${label} beginnt vor dem auslösenden Event „${cause.title}“`)
  }
  if (fact.kind === 'participation') participationHints(book, fact, add)
}

function participationHints(book: Book, fact: Extract<Fact, { kind: 'participation' }>, add: Add) {
  const event = book.events.find((e) => e.id === fact.event)
  if (!event) return
  const eventSpan = bounds(book, event.timing)
  const span = bounds(book, factTiming(book, fact))
  if (fact.timing && (span[0] < eventSpan[0] || span[1] > eventSpan[1]))
    add('participation-time', [fact.id], [fact.actor, event.id], span[0], `${factLabel(book, fact)} (${spanLabel(book, span)}) liegt außerhalb der Event-Zeit (${spanLabel(book, eventSpan)})`)
  if (!event.place || findElement(book, fact.actor)?.kind !== 'person') return
  const stayAt = (i: number) => book.facts.find((f) => f.kind === 'stay' && f.person === fact.actor && covers(book, f.timing, i))
  const elsewhere = range(span).find((i) => {
    const stay = stayAt(i)
    return stay?.kind === 'stay' && !placeChain(book, stay.place, i).some((p) => p.id === event.place)
  })
  const stay = elsewhere === undefined ? undefined : stayAt(elsewhere)
  if (elsewhere !== undefined && stay?.kind === 'stay') add('elsewhere', [fact.id], [fact.actor, event.id], elsewhere, `${name(book, fact.actor)} ist bei „${event.title}“ (${elsewhere + 1}), aber in ${name(book, stay.place)}`)
}

function relationHints(book: Book, add: Add) {
  const undirected = new Set(book.relationTypes.filter((t) => !t.directed).map((t) => t.id))
  const phases = book.facts.flatMap((f) =>
    f.kind === 'relation' ? f.phases.filter((p) => undirected.has(p.type)).map((p) => ({ fact: f, phase: p, span: bounds(book, p.timing) })) : [],
  )
  phases.forEach((a, i) =>
    phases.slice(i + 1).forEach((b) => {
      const samePair = [a.fact.from, a.fact.to].sort().join() === [b.fact.from, b.fact.to].sort().join()
      if (a.fact === b.fact || !samePair || a.phase.type !== b.phase.type || !overlap(a.span, b.span)) return
      const span: Span = [Math.max(a.span[0], b.span[0]), Math.min(a.span[1], b.span[1])]
      const [first, second] = a.span[0] <= b.span[0] ? [a, b] : [b, a]
      const type = book.relationTypes.find((t) => t.id === a.phase.type)!
      add('relation-overlap', [first.phase.id, second.phase.id], [a.fact.from, a.fact.to], span[0], `Zwei Beziehungen „${type.name}“ zwischen ${name(book, a.fact.from)} und ${name(book, a.fact.to)} überschneiden sich (${spanLabel(book, span)})`)
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
  if (gap !== undefined) {
    const end = life.find((i) => i > gap && phaseAt(i))
    add('place-gap', [place.id], [place.id], gap, `${place.name} hat ${spanLabel(book, [gap, end === undefined ? life.at(-1)! : end - 1])} keine Lage`)
  }
  const missing = life.find((i) => {
    const parent = parentAt(i)
    return parent && !covers(book, parent.existence, i)
  })
  if (missing !== undefined) add('parent-missing', [phaseAt(missing)!.id], [place.id, parentAt(missing)!.id], missing, `${place.name} liegt in ${parentAt(missing)!.name}, das auf ${missing + 1} nicht existiert`)
  const beyond = life.find((i) => {
    const phase = phaseAt(i)
    const radius = parentAt(i)?.radius
    return phase && radius !== undefined && Math.hypot(phase.x, phase.y) > radius
  })
  if (beyond !== undefined) add('outside-radius', [phaseAt(beyond)!.id], [place.id, parentAt(beyond)!.id], beyond, `${place.name} liegt außerhalb des Radius von ${parentAt(beyond)!.name}`)
  if (!book.timePoints.some((t) => t.background)) return
  const reported = new Set<string>()
  for (const i of life) {
    const phase = phaseAt(i)
    const pos = worldPosition(book, place.id, i)
    if (!phase || !pos || reported.has(phase.id) || onLayer(layerAt(book, i), pos.x, pos.y)) continue
    reported.add(phase.id)
    add('outside-layer', [phase.id], [place.id], i, `${place.name} liegt auf ${i + 1}. ${timeline(book)[i]!.name} außerhalb der Ebene`)
  }
}

function imageHints(book: Book, add: Add) {
  const check = (owner: string, image: Image, span: Span, where: string) => {
    const own = image.timing ? bounds(book, image.timing) : span
    if (own[0] < span[0] || own[1] > span[1]) add('image-time', [image.id], [owner], own[0], `Bild ${image.file} (${spanLabel(book, own)}) gilt außerhalb ${where} (${spanLabel(book, span)})`)
  }
  const last = book.timePoints.length - 1
  for (const element of [...book.persons, ...book.groups, ...book.places, ...book.events]) {
    const life: Span = 'existence' in element ? bounds(book, element.existence) : [0, last]
    for (const image of element.images) check(element.id, image, life, `der Existenz von ${name(book, element.id)}`)
  }
  for (const place of book.places) for (const phase of place.phases) for (const image of phase.images) check(place.id, image, bounds(book, phase.timing), 'seiner Orts-Phase')
}

const datesOf = (book: Book) => [
  ...book.timePoints.flatMap((t) => (t.date ? [{ id: t.id, date: t.date, what: `Datum von „${t.name}“` }] : [])),
  ...book.persons.flatMap((p) => (p.born ? [{ id: p.id, date: p.born, what: `Geburtsdatum von „${p.name}“` }] : [])),
]

function dateHints(book: Book, add: Add) {
  const cal = calendarOf(book)
  const points = timeline(book)
  points.forEach((point, i) => {
    const earlier = point.date && points.slice(0, i).find((q) => q.date && compareDates(cal, point.date!, q.date) < 0)
    if (earlier)
      add('date-order', [point.id, earlier.id], [point.id], i, `„${point.name}“ (${formatDate(cal, point.date!)}) liegt vor „${earlier.name}“ (${formatDate(cal, earlier.date!)}), steht aber danach`)
  })
  const at = new Map(points.map((t, i) => [t.id, i]))
  for (const { id, date, what } of datesOf(book)) {
    const reason = calendarMismatch(cal, date)
    if (reason) add('date-calendar', [id], [id], at.get(id) ?? 0, `${what} passt nicht zum Kalender: ${reason}`)
  }
}

function missingImages(book: Book, available: Set<string>, add: Add) {
  const owned = [
    ...[...book.persons, ...book.groups, ...book.places, ...book.events].flatMap((e) => e.images.map((image) => ({ id: e.id, image }))),
    ...book.places.flatMap((p) => p.phases.flatMap((phase) => phase.images.map((image) => ({ id: p.id, image })))),
  ]
  for (const { id, image } of owned)
    if (!available.has(image.file)) add('image-missing', [image.id], [id], image.timing ? bounds(book, image.timing)[0] : 0, `Bild ${image.file} fehlt im Repo`)
  timeline(book).forEach((point, i) => {
    if (point.background && !available.has(point.background.file)) add('image-missing', [point.background.id], [], i, `Hintergrund ${point.background.file} fehlt im Repo`)
  })
}
