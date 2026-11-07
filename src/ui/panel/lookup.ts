import { create, type NewKind } from '../../edit/ops'
import { bounds, spanLabel, type Book, type Timing } from '../../model'
import { useUi } from '../context'
import type { Option } from '../fields'

/** Kurztext einer Zeitangabe */
export const when = (book: Book, timing: Timing) => spanLabel(book, bounds(book, timing))

const OPTIONS: Record<'person' | 'group' | 'place' | 'event' | 'actor' | 'relationType', (book: Book) => Option[]> = {
  person: (book) => book.persons.map((e) => ({ id: e.id, label: e.name, color: e.color })),
  group: (book) => book.groups.map((e) => ({ id: e.id, label: e.name, color: e.color })),
  place: (book) => book.places.map((e) => ({ id: e.id, label: e.name, color: e.color })),
  event: (book) => book.events.map((e) => ({ id: e.id, label: e.title, color: e.color, hint: when(book, e.timing) })),
  actor: (book) => [...OPTIONS.person(book), ...OPTIONS.group(book)],
  relationType: (book) => book.relationTypes.map((t) => ({ id: t.id, label: t.name, color: t.color, hint: t.directed ? 'gerichtet' : '' })),
}

/** Auswahl-Einträge einer Art */
export const optionsOf = (book: Book, kind: keyof typeof OPTIONS) => OPTIONS[kind](book)

const KIND_NAMES: Record<NewKind, string> = { person: 'Person', group: 'Gruppe', place: 'Ort', event: 'Event', timePoint: 'Zeitpunkt', relationType: 'Beziehungsart' }

/** Eintrag „„Xy“ als Ort anlegen“, der das Neue anlegt und in einem Schritt verknüpft */
export function useCreate() {
  const { change, current } = useUi()
  return (kind: NewKind, link: (draft: Book, id: string) => void, label: string) => ({
    label: (q: string) => `„${q}“ als ${KIND_NAMES[kind]} anlegen`,
    run: (q: string) => change(label, (d) => link(d, create(d, kind, current, q))),
  })
}
