import { problems } from '../checks'
import { bounds, covers, factLabel, findElement, involvedIds, timeline, worldPosition, type Book, type ElementKind, type Fact, type Image, type Relation, type RelationPhase, type Stay, type Timing } from '../model'
import { newId } from '../storage/format'

/** Ob zeitliche Werte ab dem aktuellen Zeitpunkt oder für die ganze Phase geändert werden */
export type Scope = 'hier' | 'ganz'

/** Erster und letzter Index einer Zeitspanne */
export type Span = [number, number]

/** Änderung an einer Arbeitskopie des Buchs; `false` bricht ohne Änderung ab */
export type Recipe = (draft: Book) => void | false

/** Farben für neue Elemente (Festlegung 15 des Datenmodells) */
export const PALETTE = ['#f87171', '#fb923c', '#facc15', '#a3e635', '#4ade80', '#2dd4bf', '#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fde68a', '#94a3b8']

/** Ergebnis einer Änderung: neues Buch oder der Grund, warum sie verhindert wurde */
export type Produced = { book: Book } | { blocked: string }

/** Wendet eine Änderung an, führt gleiche Nachbarphasen zusammen und verhindert neue Verbote */
export function produce(book: Book, recipe: Recipe): Produced | undefined {
  const draft = structuredClone(book)
  if (recipe(draft) === false) return undefined
  // Neue Identität: Zwischenspeicher im Modell hängen am Objekt und könnten veraltet sein
  const tidied = { ...draft }
  tidy(tidied)
  const next = { ...tidied }
  const before = new Set(problems(book).map((p) => `${p.id}|${p.reason}`))
  const added = problems(next).find((p) => !before.has(`${p.id}|${p.reason}`))
  const fact = added && next.facts.find((f) => f.id === added.id)
  if (added) return { blocked: `${findElement(next, added.id)?.label ?? (fact ? factLabel(next, fact) : 'Eintrag')}: ${added.reason}` }
  return { book: next }
}

/** Alle IDs im Buch, auch die von Phasen, Bildern und Hintergründen */
export function allIds(book: Book) {
  const ids = new Set<string>()
  const add = (item: { id: string; images?: Image[]; phases?: { id: string; images?: Image[] }[] }) => {
    ids.add(item.id)
    item.images?.forEach((i) => ids.add(i.id))
    item.phases?.forEach(add)
  }
  for (const t of book.timePoints) {
    ids.add(t.id)
    if (t.background) ids.add(t.background.id)
  }
  ;[...book.persons, ...book.groups, ...book.places, ...book.events, ...book.relationTypes, ...book.facts].forEach(add)
  return ids
}

const freshId = (book: Book) => newId(allIds(book))

/** Zeitangabe zu einer Spanne: ganz außen offen, ein einzelner Zeitpunkt als `at` (Festlegung 17 des Editors) */
export function toTiming(book: Book, [a, z]: Span): Timing {
  const points = timeline(book)
  const last = points.length - 1
  if (a <= 0 && z >= last) return {}
  if (a === z) return { at: points[a]!.id }
  return { ...(a > 0 ? { from: points[a]!.id } : {}), ...(z < last ? { to: points[z]!.id } : {}) }
}

type Timed = { id: string; timing: Timing }

/** Ändert die zum Index i gültige Phase; „ab hier“ teilt sie vorher, die neue erbt weder Auslöser noch Notiz */
export function changeAt<T extends Timed>(book: Book, phases: T[], i: number, scope: Scope, mutate: (phase: T) => void, host: T[] = phases): T | undefined {
  const phase = phases.find((p) => covers(book, p.timing, i))
  if (!phase) return undefined
  const [a, z] = bounds(book, phase.timing)
  if (scope === 'ganz' || a >= i) {
    mutate(phase)
    return phase
  }
  const { causedBy: _cause, note: _note, ...rest } = structuredClone(phase) as T & { causedBy?: string; note?: string }
  const next = { ...rest, id: freshId(book) } as unknown as T
  if ('images' in next) (next as { images: Image[] }).images = splitImages(book, phase as unknown as { images: Image[] }, i)
  phase.timing = toTiming(book, [a, i - 1])
  next.timing = toTiming(book, [i, z])
  mutate(next)
  host.splice(host.indexOf(phase) + 1, 0, next)
  return next
}

// Bilder ohne Zeit gelten in beiden Teilen weiter, zeitlich begrenzte gehen an den Teil, in dem sie beginnen
function splitImages(book: Book, phase: { images: Image[] }, i: number) {
  const moved = phase.images.filter((img) => img.timing && bounds(book, img.timing)[0] >= i)
  phase.images = phase.images.filter((img) => !moved.includes(img))
  const copies = phase.images.filter((img) => !img.timing).map((img) => ({ ...img, id: freshId(book) }))
  return [...copies, ...moved]
}

/** Führt direkt aufeinanderfolgende Phasen mit gleichem Inhalt zusammen (Festlegung 19 des Editors) */
function tidy(book: Book) {
  const same = (keys: string[]) => (p: Record<string, unknown>, q: Record<string, unknown>) => keys.every((k) => JSON.stringify(p[k]) === JSON.stringify(q[k]))
  const stays = book.facts.filter((f): f is Stay => f.kind === 'stay')
  for (const person of new Set(stays.map((s) => s.person)))
    merge(book, stays.filter((s) => s.person === person), same(['place', 'causedBy', 'note']), (gone) => void book.facts.splice(book.facts.indexOf(gone), 1))
  for (const fact of book.facts) if (fact.kind === 'relation') merge(book, fact.phases, same(['type', 'strength', 'causedBy', 'note']))
  for (const place of book.places) merge(book, place.phases, same(['parent', 'x', 'y', 'images', 'note']))
}

function merge<T extends Timed>(book: Book, phases: T[], same: (p: Record<string, unknown>, q: Record<string, unknown>) => boolean, remove: (gone: T) => void = (gone) => void phases.splice(phases.indexOf(gone), 1)) {
  const sorted = [...phases].sort((p, q) => bounds(book, p.timing)[0] - bounds(book, q.timing)[0])
  for (let k = 1; k < sorted.length; k++) {
    const [p, q] = [sorted[k - 1]!, sorted[k]!]
    const [a, z] = bounds(book, p.timing)
    const [c, d] = bounds(book, q.timing)
    if (z + 1 !== c || !same(p as unknown as Record<string, unknown>, q as unknown as Record<string, unknown>)) continue
    p.timing = toTiming(book, [a, d])
    remove(q)
    sorted.splice(k--, 1)
  }
}

const relations = (book: Book) => book.facts.filter((f): f is Relation => f.kind === 'relation')

/** Freie Spanne um i, die keine der Phasen berührt, begrenzt auf `wanted` */
function freeSpan(book: Book, phases: Timed[], i: number, wanted: Span): Span {
  const spans = phases.map((p) => bounds(book, p.timing))
  return [Math.max(wanted[0], ...spans.filter((s) => s[1] < i).map((s) => s[1] + 1)), Math.min(wanted[1], ...spans.filter((s) => s[0] > i).map((s) => s[0] - 1))]
}

/** Person ab i (oder für die ganze Phase) an einen Ort; ohne Aufenthalt bis zum nächsten eigenen */
export function moveStay(book: Book, person: string, place: string, i: number, scope: Scope) {
  const own = book.facts.filter((f): f is Stay => f.kind === 'stay' && f.person === person)
  const stay = own.find((s) => covers(book, s.timing, i))
  if (stay?.place === place) return false
  if (stay) {
    changeAt(book, own, i, scope, (s) => (s.place = place), book.facts as Stay[])
    return
  }
  const last = book.timePoints.length - 1
  book.facts.push({ kind: 'stay', id: freshId(book), person, place, timing: toTiming(book, freeSpan(book, own, i, [i, last])) })
}

/**
 * Verbindet a mit c; eine gerichtete Art zeigt immer von a (gezogen) nach c (Ziel).
 * Geändert wird die Beziehung in Zugrichtung, eine gerichtete c → a bleibt unberührt (Festlegung 25 des Editors).
 */
export function connect(book: Book, a: string, c: string, type: string, i: number, scope: Scope) {
  const directed = (t: string) => !!book.relationTypes.find((r) => r.id === t)?.directed
  const between = relations(book).filter((r) => (r.from === a && r.to === c) || (r.from === c && r.to === a))
  const live = between.find((r) => r.phases.some((p) => covers(book, p.timing, i) && (r.from === a || !directed(p.type))))
  if (live && (live.from === a || !directed(type))) {
    changeAt(book, live.phases, i, scope, (p) => (p.type = type))
    return
  }
  const last = book.timePoints.length - 1
  let wanted: Span = [i, last]
  if (live) {
    const phase = live.phases.find((p) => covers(book, p.timing, i))!
    const [s0, s1] = bounds(book, phase.timing)
    if (scope === 'hier' && s0 < i) phase.timing = toTiming(book, [s0, i - 1])
    else live.phases.splice(live.phases.indexOf(phase), 1)
    if (!live.phases.length) book.facts.splice(book.facts.indexOf(live), 1)
    wanted = [scope === 'hier' ? i : s0, s1]
  }
  const remaining = relations(book)
  const target = remaining.find((r) => r.from === a && r.to === c) ?? (directed(type) ? undefined : remaining.find((r) => r.from === c && r.to === a))
  const phase: RelationPhase = { id: freshId(book), timing: toTiming(book, freeSpan(book, target?.phases ?? [], i, wanted)), type, strength: 3 }
  if (target) target.phases.push(phase)
  else book.facts.push({ kind: 'relation', id: freshId(book), from: a, to: c, phases: [phase] })
}

/** Verschiebt einen Ort zum Index i an eine Weltposition; gespeichert wird relativ zum Elternort */
export function movePlace(book: Book, id: string, i: number, x: number, y: number, scope: Scope) {
  const place = book.places.find((p) => p.id === id)
  const parent = place?.phases.find((p) => covers(book, p.timing, i))?.parent
  const origin = (parent && worldPosition(book, parent, i)) || { x: 0, y: 0 }
  if (!place) return false
  changeAt(book, place.phases, i, scope, (p) => {
    p.x = round(x - origin.x)
    p.y = round(y - origin.y)
  })
}

const round = (value: number) => Math.round(value * 10) / 10

/** Nächste noch nicht benutzte Farbe der Palette */
function nextColor(book: Book) {
  const used = new Set([...book.persons, ...book.groups, ...book.places, ...book.events, ...book.relationTypes].map((e) => e.color))
  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[(book.persons.length + book.places.length) % PALETTE.length]!
}

/** Was sich neu anlegen lässt */
export type NewKind = ElementKind | 'timePoint' | 'relationType'

const NEW_NAMES: Record<NewKind, string> = { person: 'Neue Person', group: 'Neue Gruppe', place: 'Neuer Ort', event: 'Neues Event', timePoint: 'Neuer Zeitpunkt', relationType: 'Neue Art' }

/** Legt ein Element an und liefert seine ID; Orte an `at` (Weltposition), Events zum Index i, Zeitpunkte nach i */
export function create(book: Book, kind: NewKind, i: number, name = '', at?: { x: number; y: number }): string {
  const id = freshId(book)
  const base = { id, name: name || NEW_NAMES[kind], description: '', color: nextColor(book), images: [] }
  if (kind === 'person') book.persons.push({ ...base, existence: {} })
  if (kind === 'group') book.groups.push({ ...base, existence: {} })
  if (kind === 'place') {
    const spot = at ?? freeSpot(book, i)
    const phase = newId(new Set([...allIds(book), id]))
    book.places.push({ ...base, existence: {}, phases: [{ id: phase, timing: {}, x: round(spot.x), y: round(spot.y), images: [] }] })
  }
  if (kind === 'event') {
    const { name: title, ...rest } = base
    book.events.push({ ...rest, title, result: '', timing: { at: timeline(book)[i]!.id } })
  }
  if (kind === 'relationType') book.relationTypes.push({ id, name: base.name, category: '', directed: false, color: base.color })
  if (kind === 'timePoint') {
    const points = timeline(book)
    const [before, after] = [points[i]?.order ?? 0, points[i + 1]?.order]
    book.timePoints.push({ id, name: base.name, order: after === undefined ? before + 1 : (before + after) / 2 })
  }
  return id
}

function freeSpot(book: Book, i: number) {
  const taken = book.places.flatMap((p) => {
    const pos = covers(book, p.existence, i) ? worldPosition(book, p.id, i) : undefined
    return pos ? [{ ...pos, r: p.radius ?? 2.1 }] : []
  })
  for (let k = 0; k < 80; k++) {
    const angle = k * 2.4
    const r = k * 0.4
    const spot = { x: Math.cos(angle) * r, y: Math.sin(angle) * r }
    if (Math.abs(spot.x) < 9 && Math.abs(spot.y) < 9 && taken.every((t) => Math.hypot(t.x - spot.x, t.y - spot.y) > t.r + 2.4)) return spot
  }
  return { x: 0, y: 0 }
}

/** Verschiebt den Zeitpunkt an Position `from` nach `to` (Indizes in der Zeitleiste) */
export function moveTimePoint(book: Book, from: number, to: number) {
  const points = timeline(book)
  const moving = points[from]
  if (!moving || from === to || to < 0 || to >= points.length) return false
  const rest = points.filter((p) => p !== moving)
  const [before, after] = [rest[to - 1]?.order, rest[to]?.order]
  const order = before === undefined ? after! - 1 : after === undefined ? before + 1 : (before + after) / 2
  book.timePoints.find((t) => t.id === moving.id)!.order = order
}

/** Entfernt einen Fakt oder eine Beziehungsphase; eine Beziehung ohne Phase geht mit */
export function removeFact(book: Book, id: string) {
  const fact = book.facts.find((f) => f.id === id)
  if (fact) {
    book.facts.splice(book.facts.indexOf(fact), 1)
    return
  }
  for (const relation of relations(book)) {
    const phase = relation.phases.find((p) => p.id === id)
    if (!phase) continue
    relation.phases.splice(relation.phases.indexOf(phase), 1)
    if (!relation.phases.length) book.facts.splice(book.facts.indexOf(relation), 1)
  }
}

/** Was beim Löschen eines Elements mitgeht oder sich ändert, als lesbare Liste für den Dialog */
export function dependents(book: Book, id: string): string[] {
  const name = (ref: string) => findElement(book, ref)?.label ?? ref
  const facts = book.facts.filter((f) => involvedIds(f).includes(id))
  const out = facts.map((f) => `${FACT_NAMES[f.kind]}: ${involvedIds(f).filter((r) => r !== id).map(name).join(', ')}`)
  for (const e of book.events) if (e.place === id) out.push(`„${e.title}“ verliert den Ort`)
  for (const p of book.places) if (p.phases.some((ph) => ph.parent === id)) out.push(`${p.name} verliert den Elternort, die Lage bleibt`)
  for (const f of book.facts) for (const c of causes(f)) if (c.causedBy === id) out.push(`Auslöser von ${FACT_NAMES[f.kind]} ${involvedIds(f).map(name).join(', ')} entfällt`)
  for (const r of relations(book)) for (const p of r.phases) if (p.type === id) out.push(`Beziehung ${name(r.from)} – ${name(r.to)} (${bounds(book, p.timing).map((k) => k + 1).join('–')})`)
  if (book.timePoints.some((t) => t.id === id)) {
    const only = timingsIn(book).filter((t) => t.removable && 'at' in t.timing && t.timing.at === id)
    const moved = timingsIn(book).filter((t) => !('at' in t.timing) && (t.timing.from === id || t.timing.to === id))
    if (only.length) out.push(`${only.length} Einträge gelten nur hier und werden gelöscht`)
    if (moved.length) out.push(`${moved.length} Zeitangaben rücken auf den Nachbarn`)
  }
  return out
}

const FACT_NAMES: Record<Fact['kind'], string> = { stay: 'Aufenthalt', journey: 'Reise', participation: 'Teilnahme', membership: 'Mitgliedschaft', relation: 'Beziehung' }

const causes = (fact: Fact): { causedBy?: string }[] => (fact.kind === 'relation' ? fact.phases : [fact])

/** Löscht ein Element mit allem, was ohne es nicht bestehen kann (Tabelle „Löschen“ im Editor-Vorschlag) */
export function removeElement(book: Book, id: string) {
  if (book.timePoints.some((t) => t.id === id)) return removeTimePoint(book, id)
  const last = book.timePoints.length - 1
  for (const place of book.places)
    for (const phase of place.phases) {
      if (phase.parent !== id) continue
      const origin = worldPosition(book, id, Math.min(bounds(book, phase.timing)[0], last))
      if (origin) Object.assign(phase, { x: round(phase.x + origin.x), y: round(phase.y + origin.y) })
      delete phase.parent
    }
  book.facts = book.facts.filter((f) => !involvedIds(f).includes(id))
  for (const f of book.facts) for (const c of causes(f)) if (c.causedBy === id) delete c.causedBy
  for (const r of relations(book)) r.phases = r.phases.filter((p) => p.type !== id)
  book.facts = book.facts.filter((f) => f.kind !== 'relation' || f.phases.length)
  for (const e of book.events) if (e.place === id) delete e.place
  for (const key of ['persons', 'groups', 'places', 'events', 'relationTypes'] as const) (book[key] as { id: string }[]) = (book[key] as { id: string }[]).filter((e) => e.id !== id)
}

type TimingRef = { timing: Timing; set: (t: Timing) => void; removable?: () => void }

// Jede Zeitangabe im Buch mit Setter; `removable` löscht den Eintrag, falls er nur zu einem gelöschten Zeitpunkt gilt
function timingsIn(book: Book): TimingRef[] {
  const out: TimingRef[] = []
  const images = (list: Image[]) => {
    for (const img of list) if (img.timing) out.push({ timing: img.timing, set: (t) => (img.timing = t) })
  }
  for (const e of [...book.persons, ...book.groups, ...book.places]) out.push({ timing: e.existence, set: (t) => (e.existence = t) })
  for (const e of [...book.persons, ...book.groups, ...book.places, ...book.events]) images(e.images)
  for (const p of book.places)
    for (const ph of p.phases) {
      out.push({ timing: ph.timing, set: (t) => (ph.timing = t), removable: () => p.phases.splice(p.phases.indexOf(ph), 1) })
      images(ph.images)
    }
  for (const e of book.events) out.push({ timing: e.timing, set: (t) => (e.timing = t), removable: () => removeElement(book, e.id) })
  for (const f of book.facts) {
    if (f.kind === 'relation') for (const ph of f.phases) out.push({ timing: ph.timing, set: (t) => (ph.timing = t), removable: () => removeFact(book, ph.id) })
    else if (f.kind === 'participation') {
      if (f.timing) out.push({ timing: f.timing, set: (t) => (f.timing = t) })
    }
    else out.push({ timing: f.timing, set: (t) => (f.timing = t), removable: () => removeFact(book, f.id) })
  }
  return out
}

/** Löscht einen Zeitpunkt; Spannen rücken auf den Nachbarn, Einträge nur zu diesem Zeitpunkt gehen mit */
function removeTimePoint(book: Book, id: string) {
  const points = timeline(book)
  if (points.length <= 1) return false
  const k = points.findIndex((t) => t.id === id)
  const [prev, next] = [points[k - 1]?.id, points[k + 1]?.id]
  const refs = timingsIn(book)
  const doomed: (() => void)[] = []
  for (const ref of refs) {
    const t = ref.timing
    if ('at' in t) {
      if (t.at !== id) continue
      if (ref.removable) doomed.push(ref.removable)
      else ref.set({ at: (next ?? prev)! })
      continue
    }
    const from = t.from === id ? (next ?? prev) : t.from
    const to = t.to === id ? (prev ?? next) : t.to
    ref.set(from && from === to ? { at: from } : { ...(from ? { from } : {}), ...(to ? { to } : {}) })
  }
  doomed.forEach((remove) => remove())
  book.timePoints = book.timePoints.filter((t) => t.id !== id)
}

/** Beliebiges Objekt mit dieser ID: Element, Zeitpunkt, Art, Fakt, Phase, Bild oder Hintergrund */
export function byId<T>(book: Book, id: string): T {
  const named = [...book.persons, ...book.groups, ...book.places, ...book.events]
  const all: { id: string }[] = [
    ...book.timePoints,
    ...book.timePoints.flatMap((t) => (t.background ? [t.background] : [])),
    ...named,
    ...named.flatMap((e) => e.images),
    ...book.places.flatMap((p) => [...p.phases, ...p.phases.flatMap((ph) => ph.images)]),
    ...book.relationTypes,
    ...book.facts,
    ...relations(book).flatMap((r) => r.phases),
  ]
  const found = all.find((x) => x.id === id)
  if (!found) throw new Error(`Unbekannte ID ${id}`)
  return found as T
}

/** Setzt ein optionales Textfeld; leer entfernt es */
export function setText(target: object, key: string, value: string) {
  const record = target as Record<string, unknown>
  if (value) record[key] = value
  else delete record[key]
}

/** Fügt einem Element ein Bild hinzu und liefert dessen ID */
export function addImage(book: Book, owner: string, file: string) {
  const element = findElement(book, owner)?.element
  if (!element) return undefined
  const id = freshId(book)
  element.images.push({ id, file, order: Math.max(0, ...element.images.map((i) => i.order)) + 1 })
  return id
}

/** Alle Bilddateien, auf die das Buch verweist */
export function imageFiles(book: Book) {
  const files = new Set<string>()
  for (const e of [...book.persons, ...book.groups, ...book.places, ...book.events]) e.images.forEach((i) => files.add(i.file))
  for (const p of book.places) for (const ph of p.phases) ph.images.forEach((i) => files.add(i.file))
  for (const t of book.timePoints) if (t.background) files.add(t.background.file)
  return files
}
