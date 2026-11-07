import type { Hint } from '../checks'
import { bounds, factLabel, factTiming, findElement, spanLabel, worldPosition, type Book, type Fact, type Image, type Place, type Timing } from '../model'
import { newId } from '../storage/format'
import { allIds, removeFact, toTiming, type Recipe, type Span } from './ops'

/** Eine Lösung im Hinweis-Dialog; ohne `recipe` muss die Oberfläche ein Bild hochladen lassen */
export interface Fix {
  label: string
  preview: string
  recipe?: Recipe
  upload?: string
}

/** Zeile im Mini-Zeitstrahl des Dialogs */
interface Row {
  label: string
  span: Span
  color: string
}

/** Lösungen zu einem Hinweis mit den Zeitspannen, die sich widersprechen; `bad` ist der Widerspruch */
export interface FixPlan {
  fixes: Fix[]
  rows: Row[]
  bad?: Span
}

const union = ([a, b]: Span, [c, d]: Span): Span => [Math.min(a, c), Math.max(b, d)]
const intersect = ([a, b]: Span, [c, d]: Span): Span | undefined => (Math.max(a, c) <= Math.min(b, d) ? [Math.max(a, c), Math.min(b, d)] : undefined)
const name = (book: Book, id: string) => findElement(book, id)?.label ?? id
const color = (book: Book, id: string) => findElement(book, id)?.element.color ?? '#8b93a7'

type Timed = { label: string; color: string; timing: Timing; set: (draft: Book, t: Timing) => void; fact: Fact }

// Fakt oder Beziehungsphase mit ihrer Zeit; eine Teilnahme ohne eigene Zeit gilt zur Event-Zeit
function timed(book: Book, id: string): Timed | undefined {
  for (const fact of book.facts) {
    if (fact.kind === 'relation') {
      const k = fact.phases.findIndex((p) => p.id === id)
      const phase = fact.phases[k]
      if (phase) return { label: factLabel(book, fact, phase), color: color(book, fact.from), timing: phase.timing, set: (d, t) => (factIn(d, fact.id, 'relation').phases[k]!.timing = t), fact }
    } else if (fact.id === id) {
      const owner = fact.kind === 'participation' ? fact.actor : fact.person
      return { label: factLabel(book, fact), color: color(book, owner), timing: factTiming(book, fact), set: (d, t) => ((factIn(d, id, fact.kind) as { timing?: Timing }).timing = t), fact }
    }
  }
}

const factIn = <K extends Fact['kind']>(draft: Book, id: string, kind: K) => draft.facts.find((f) => f.id === id && f.kind === kind) as Extract<Fact, { kind: K }>

const existenceOf = (draft: Book, id: string) => findElement(draft, id)!.element as { existence: Timing }

/** Lösungen nach der Tabelle „Lösungen je Hinweis“ im Editor-Vorschlag */
export function fixesFor(book: Book, hint: Hint): FixPlan {
  const plan = PLANS[hint.rule](book, hint)
  return plan ?? { fixes: [], rows: [] }
}

const PLANS: Record<Hint['rule'], (book: Book, hint: Hint) => FixPlan | undefined> = {
  clash: (book, { ids }) => {
    const [first, second] = ids.map((id) => timed(book, id))
    if (!first || !second) return undefined
    const [a, z] = bounds(book, first.timing)
    const [c, d] = bounds(book, second.timing)
    const short = (t: Timed) => t.label.replace(/ von .*? (in|nach) /, ' $1 ')
    const fixes: Fix[] = []
    if (a < c) fixes.push({ label: `${short(first)} endet vor ${short(second)}`, preview: `${short(first)}: ${spanLabel(book, [a, c - 1])}`, recipe: (dr) => first.set(dr, toTiming(dr, [a, c - 1])) })
    if (z < d) fixes.push({ label: `${short(second)} beginnt nach ${short(first)}`, preview: `${short(second)}: ${spanLabel(book, [z + 1, d])}`, recipe: (dr) => second.set(dr, toTiming(dr, [z + 1, d])) })
    fixes.push({ label: `${short(second)} entfernen`, preview: `nur noch ${short(first)} (${spanLabel(book, [a, z])})`, recipe: (dr) => removeFact(dr, ids[1]!) })
    return { fixes, rows: [row(book, first), row(book, second)], bad: intersect([a, z], [c, d]) }
  },

  'outside-existence': (book, { ids: [id, element] }) => {
    const fact = timed(book, id!)
    if (!fact || !element) return undefined
    const span = bounds(book, fact.timing)
    const life = bounds(book, existenceOf(book, element).existence)
    const inside = intersect(span, life)
    const fixes: Fix[] = [{ label: `Existenz von ${name(book, element)} erweitern`, preview: `${name(book, element)} existiert ${spanLabel(book, union(span, life))}`, recipe: (dr) => void (existenceOf(dr, element).existence = toTiming(dr, union(span, life))) }]
    if (inside) fixes.push({ label: 'Auf die Existenz kürzen', preview: `${fact.label}: ${spanLabel(book, inside)}`, recipe: (dr) => fact.set(dr, toTiming(dr, inside)) })
    fixes.push({ label: 'Entfernen', preview: `${fact.label} fällt weg`, recipe: (dr) => removeFact(dr, id!) })
    return { fixes, rows: [{ label: `Existenz ${name(book, element)}`, span: life, color: '#8b93a7' }, row(book, fact)], bad: span[0] < life[0] ? [span[0], Math.min(span[1], life[0] - 1)] : [Math.max(span[0], life[1] + 1), span[1]] }
  },

  'before-cause': (book, { ids: [id, event] }) => {
    const fact = timed(book, id!)
    const cause = book.events.find((e) => e.id === event)
    if (!fact || !cause) return undefined
    const [a, z] = bounds(book, fact.timing)
    const c = bounds(book, cause.timing)[0]
    const fixes: Fix[] = []
    if (c <= z) fixes.push({ label: `Beginn auf „${cause.title}“ legen`, preview: `${fact.label}: ${spanLabel(book, [c, z])}`, recipe: (dr) => fact.set(dr, toTiming(dr, [c, z])) })
    fixes.push({ label: 'Auslöser entfernen', preview: `${fact.label} ohne Auslöser`, recipe: (dr) => withCause(dr, id!, (item) => delete item.causedBy) })
    return { fixes, rows: [row(book, fact), { label: cause.title, span: bounds(book, cause.timing), color: cause.color }], bad: [a, c - 1] }
  },

  'participation-time': (book, { ids: [id] }) => {
    const part = book.facts.find((f) => f.id === id)
    const event = part?.kind === 'participation' ? book.events.find((e) => e.id === part.event) : undefined
    if (part?.kind !== 'participation' || !part.timing || !event) return undefined
    const [own, es] = [bounds(book, part.timing), bounds(book, event.timing)]
    return {
      fixes: [
        { label: 'Eigene Zeit entfernen', preview: `gilt zur Event-Zeit ${spanLabel(book, es)}`, recipe: (dr) => void delete factIn(dr, id!, 'participation').timing },
        { label: 'Event-Zeit erweitern', preview: `„${event.title}“: ${spanLabel(book, union(own, es))}`, recipe: (dr) => void (dr.events.find((e) => e.id === event.id)!.timing = toTiming(dr, union(own, es))) },
      ],
      rows: [{ label: event.title, span: es, color: event.color }, { label: factLabel(book, part), span: own, color: color(book, part.actor) }],
      bad: own,
    }
  },

  elsewhere: (book, { ids: [id], at }) => {
    const part = book.facts.find((f) => f.id === id)
    const event = part?.kind === 'participation' ? book.events.find((e) => e.id === part.event) : undefined
    const stay = book.facts.find((f) => f.kind === 'stay' && part?.kind === 'participation' && f.person === part.actor && bounds(book, f.timing)[0] <= at && at <= bounds(book, f.timing)[1])
    if (part?.kind !== 'participation' || !event?.place || stay?.kind !== 'stay') return undefined
    const es = bounds(book, factTiming(book, part))
    const [who, where] = [name(book, part.actor), name(book, event.place)]
    return {
      fixes: [
        { label: `Während „${event.title}“ in ${where}`, preview: `${who}: ${spanLabel(book, es)} in ${where}, davor und danach wie bisher`, recipe: (dr) => stayDuring(dr, part.actor, event.place!, es) },
        { label: 'Teilnahme entfernen', preview: `${who} ist nicht bei „${event.title}“`, recipe: (dr) => removeFact(dr, id!) },
      ],
      rows: [{ label: event.title, span: es, color: event.color }, { label: `${who} in ${name(book, stay.place)}`, span: bounds(book, stay.timing), color: color(book, stay.place) }],
      bad: intersect(es, bounds(book, stay.timing)),
    }
  },

  'event-place': (book, { ids: [id] }) => {
    const event = book.events.find((e) => e.id === id)
    const place = event?.place ? book.places.find((p) => p.id === event.place) : undefined
    if (!event || !place) return undefined
    const [es, life] = [bounds(book, event.timing), bounds(book, place.existence)]
    return {
      fixes: [
        { label: `Existenz von ${place.name} erweitern`, preview: `${place.name} existiert ${spanLabel(book, union(es, life))}`, recipe: (dr) => void (existenceOf(dr, place.id).existence = toTiming(dr, union(es, life))) },
        { label: 'Event ohne Ort', preview: `„${event.title}“ ohne Ort`, recipe: (dr) => void delete dr.events.find((e) => e.id === id)!.place },
      ],
      rows: [{ label: `Existenz ${place.name}`, span: life, color: '#8b93a7' }, { label: event.title, span: es, color: event.color }],
      bad: es,
    }
  },

  'relation-overlap': (book, { ids }) => {
    const [first, second] = ids.map((id) => timed(book, id))
    if (!first || !second) return undefined
    const [a, z] = bounds(book, first.timing)
    const [c, d] = bounds(book, second.timing)
    const fixes: Fix[] = [{ label: 'Zu einer Beziehung zusammenführen', preview: `${first.label}: ${spanLabel(book, union([a, z], [c, d]))}`, recipe: (dr) => {
      first.set(dr, toTiming(dr, union([a, z], [c, d])))
      removeFact(dr, ids[1]!)
    } }]
    if (z < d) fixes.push({ label: 'Spätere nach der früheren beginnen lassen', preview: `${second.label}: ${spanLabel(book, [z + 1, d])}`, recipe: (dr) => second.set(dr, toTiming(dr, [z + 1, d])) })
    return { fixes, rows: [row(book, first), row(book, second)], bad: intersect([a, z], [c, d]) }
  },

  'place-gap': (book, { ids: [id], at }) => {
    const place = book.places.find((p) => p.id === id)
    if (!place) return undefined
    const life = bounds(book, place.existence)
    const spans = place.phases.map((p) => ({ phase: p, span: bounds(book, p.timing) }))
    const next = spans.filter((s) => s.span[0] > at).sort((x, y) => x.span[0] - y.span[0])[0]
    const prev = spans.filter((s) => s.span[1] < at).sort((x, y) => y.span[1] - x.span[1])[0]
    const gap: Span = [at, next ? next.span[0] - 1 : life[1]]
    const fixes: Fix[] = []
    if (prev) fixes.push({ label: 'Vorherige Lage verlängern', preview: `Lage bei ${prev.phase.x} / ${prev.phase.y}: ${spanLabel(book, [prev.span[0], gap[1]])}`, recipe: (dr) => void (phaseIn(dr, id!, prev.phase.id).timing = toTiming(dr, [prev.span[0], gap[1]])) })
    else if (next) fixes.push({ label: 'Nächste Lage früher beginnen', preview: `Lage bei ${next.phase.x} / ${next.phase.y}: ${spanLabel(book, [gap[0], next.span[1]])}`, recipe: (dr) => void (phaseIn(dr, id!, next.phase.id).timing = toTiming(dr, [gap[0], next.span[1]])) })
    const shorter: Span | undefined = gap[1] === life[1] ? [life[0], gap[0] - 1] : gap[0] === life[0] ? [gap[1] + 1, life[1]] : undefined
    if (shorter && shorter[0] <= shorter[1]) fixes.push({ label: 'Existenz kürzen', preview: `${place.name} existiert ${spanLabel(book, shorter)}`, recipe: (dr) => void (existenceOf(dr, id!).existence = toTiming(dr, shorter)) })
    return { fixes, rows: [{ label: `Existenz ${place.name}`, span: life, color: '#8b93a7' }, ...spans.map((s) => ({ label: `Lage ${s.phase.x} / ${s.phase.y}`, span: s.span, color: place.color }))], bad: gap }
  },

  'parent-missing': (book, { ids: [phaseId] }) => {
    const found = phaseOwner(book, phaseId!)
    const parent = found?.phase.parent ? book.places.find((p) => p.id === found.phase.parent) : undefined
    if (!found || !parent) return undefined
    const [span, life] = [bounds(book, found.phase.timing), bounds(book, parent.existence)]
    const origin = worldPosition(book, parent.id, Math.max(span[0], life[0]))
    return {
      fixes: [
        { label: `Existenz von ${parent.name} erweitern`, preview: `${parent.name} existiert ${spanLabel(book, union(span, life))}`, recipe: (dr) => void (existenceOf(dr, parent.id).existence = toTiming(dr, union(span, life))) },
        { label: 'Elternort entfernen', preview: `${found.place.name} liegt frei, die Lage bleibt`, recipe: (dr) => {
          const phase = phaseIn(dr, found.place.id, phaseId!)
          delete phase.parent
          if (origin) Object.assign(phase, { x: phase.x + origin.x, y: phase.y + origin.y })
        } },
      ],
      rows: [{ label: `Existenz ${parent.name}`, span: life, color: '#8b93a7' }, { label: `${found.place.name} in ${parent.name}`, span, color: found.place.color }],
      bad: span[0] < life[0] ? [span[0], Math.min(span[1], life[0] - 1)] : [Math.max(span[0], life[1] + 1), span[1]],
    }
  },

  'outside-radius': (book, { ids: [phaseId] }) => {
    const found = phaseOwner(book, phaseId!)
    const parent = found?.phase.parent ? book.places.find((p) => p.id === found.phase.parent) : undefined
    if (!found || !parent) return undefined
    const distance = Math.hypot(found.phase.x, found.phase.y)
    const radius = Math.ceil(distance + 0.5)
    const edge = ((parent.radius ?? 0) * 0.9) / distance
    return {
      fixes: [
        { label: `Radius von ${parent.name} vergrößern`, preview: `Radius ${radius}`, recipe: (dr) => void (dr.places.find((p) => p.id === parent.id)!.radius = radius) },
        { label: 'An den Rand rücken', preview: `${found.place.name} bei ${round(found.phase.x * edge)} / ${round(found.phase.y * edge)}`, recipe: (dr) => {
          const phase = phaseIn(dr, found.place.id, phaseId!)
          Object.assign(phase, { x: round(phase.x * edge), y: round(phase.y * edge) })
        } },
      ],
      rows: [],
    }
  },

  'image-time': (book, { ids: [imageId] }) => {
    const found = imageOwner(book, imageId!)
    if (!found?.image.timing) return undefined
    const own = bounds(book, found.image.timing)
    const inside = intersect(own, found.span) ?? found.span
    return {
      fixes: [
        { label: 'Bildzeit anpassen', preview: `Bild gilt ${spanLabel(book, inside)}`, recipe: (dr) => void (imageOwner(dr, imageId!)!.image.timing = toTiming(dr, inside)) },
        { label: 'Bildzeit entfernen', preview: 'Bild gilt immer, solange es sein Element gibt', recipe: (dr) => void delete imageOwner(dr, imageId!)!.image.timing },
      ],
      rows: [{ label: found.owner, span: found.span, color: '#8b93a7' }, { label: found.image.file, span: own, color: '#818cf8' }],
      bad: own,
    }
  },

  'image-missing': (book, { ids: [id] }) => {
    const background = book.timePoints.find((t) => t.background?.id === id)
    const found = background ? undefined : imageOwner(book, id!)
    if (!background && !found) return undefined
    return {
      fixes: [
        { label: 'Bild neu hochladen', preview: 'Datei auswählen, der Verweis bleibt', upload: id },
        { label: 'Verweis entfernen', preview: background ? `${background.name} ohne Hintergrund` : `${found!.owner} ohne dieses Bild`, recipe: (dr) => removeImage(dr, id!) },
      ],
      rows: [],
    }
  },
}

const round = (value: number) => Math.round(value * 10) / 10
const row = (book: Book, t: Timed): Row => ({ label: t.label, span: bounds(book, t.timing), color: t.color })

function withCause(draft: Book, id: string, change: (item: { causedBy?: string }) => void) {
  for (const fact of draft.facts) {
    if (fact.kind === 'relation') fact.phases.filter((p) => p.id === id).forEach(change)
    else if (fact.id === id) change(fact)
  }
}

/** Person während einer Spanne an einen Ort; ihre anderen Aufenthalte bleiben davor und danach bestehen */
function stayDuring(draft: Book, person: string, place: string, span: Span) {
  for (const stay of draft.facts.filter((f) => f.kind === 'stay' && f.person === person)) {
    if (stay.kind !== 'stay') continue
    const [a, z] = bounds(draft, stay.timing)
    if (z < span[0] || a > span[1]) continue
    draft.facts.splice(draft.facts.indexOf(stay), 1)
    if (a < span[0]) draft.facts.push({ ...stay, timing: toTiming(draft, [a, span[0] - 1]) })
    if (z > span[1]) draft.facts.push({ ...stay, id: newId(allIds(draft)), timing: toTiming(draft, [span[1] + 1, z]) })
  }
  draft.facts.push({ kind: 'stay', id: newId(allIds(draft)), person, place, timing: toTiming(draft, span) })
}

const phaseOwner = (book: Book, id: string) => {
  for (const place of book.places) {
    const phase = place.phases.find((p) => p.id === id)
    if (phase) return { place, phase }
  }
}

const phaseIn = (draft: Book, place: string, id: string) => (draft.places.find((p) => p.id === place) as Place).phases.find((p) => p.id === id)!

function imageOwner(book: Book, id: string): { image: Image; owner: string; span: Span } | undefined {
  const last = book.timePoints.length - 1
  for (const e of [...book.persons, ...book.groups, ...book.places, ...book.events]) {
    const image = e.images.find((i) => i.id === id)
    if (image) return { image, owner: 'title' in e ? e.title : e.name, span: 'existence' in e ? bounds(book, e.existence) : [0, last] }
  }
  for (const place of book.places)
    for (const phase of place.phases) {
      const image = phase.images.find((i) => i.id === id)
      if (image) return { image, owner: `${place.name} (Lage)`, span: bounds(book, phase.timing) }
    }
}

/** Entfernt ein Bild oder einen Hintergrund über seine ID */
export function removeImage(draft: Book, id: string) {
  for (const t of draft.timePoints) if (t.background?.id === id) delete t.background
  for (const e of [...draft.persons, ...draft.groups, ...draft.places, ...draft.events]) e.images = e.images.filter((i) => i.id !== id)
  for (const p of draft.places) for (const ph of p.phases) ph.images = ph.images.filter((i) => i.id !== id)
}
