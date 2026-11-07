import { describe, expect, it } from 'vitest'
import { bounds, timeline, worldPosition, type Book, type Fact, type Relation } from '../model'
import { connect, create, dependents, moveStay, movePlace, moveTimePoint, produce, removeElement, toTiming, type Recipe } from './ops'

const point = (id: string, order: number) => ({ id, name: id.toUpperCase(), order })
const place = (id: string, x = 0, extra: object = {}) => ({ id, name: id, color: '#000000', description: '', existence: {}, images: [], phases: [{ id: `${id}-l`, timing: {}, x, y: 0, images: [] }], ...extra })
const person = (id: string) => ({ id, name: id, color: '#000000', description: '', existence: {}, images: [] })

/** Fünf Zeitpunkte, Personen a, b, Orte x, y, gerichtete Art „liebt“ und ungerichtete „Freunde“ */
const base = (facts: Fact[] = [], extra: Partial<Book> = {}): Book => ({
  title: 'Test',
  acceptedHints: [],
  timePoints: ['t1', 't2', 't3', 't4', 't5'].map((id, k) => point(id, k + 1)),
  persons: [person('a'), person('b')],
  groups: [],
  places: [place('x'), place('y', 6)],
  events: [],
  relationTypes: [
    { id: 'love', name: 'liebt', category: '', directed: true, color: '#ff0000' },
    { id: 'friends', name: 'Freunde', category: '', directed: false, color: '#00ff00' },
  ],
  facts,
  ...extra,
})

const run = (book: Book, recipe: Recipe) => {
  const result = produce(book, recipe)
  if (!result || 'blocked' in result) throw new Error(result ? result.blocked : 'abgebrochen')
  return result.book
}
const spans = (book: Book, kind: Fact['kind']) =>
  book.facts.filter((f) => f.kind === kind).map((f) => ('timing' in f && f.timing ? `${'place' in f ? f.place : ''} ${bounds(book, f.timing).join('-')}` : ''))
const rels = (book: Book) =>
  book.facts.filter((f): f is Relation => f.kind === 'relation').map((r) => `${r.from}>${r.to}: ${r.phases.map((p) => `${p.type} ${bounds(book, p.timing).join('-')}`).join(', ')}`)

describe('Zeitangaben', () => {
  const book = base()
  it('lässt Enden offen und macht aus einem Punkt at', () => {
    expect(toTiming(book, [0, 4])).toEqual({})
    expect(toTiming(book, [2, 2])).toEqual({ at: 't3' })
    expect(toTiming(book, [0, 2])).toEqual({ to: 't3' })
    expect(toTiming(book, [1, 4])).toEqual({ from: 't2' })
    expect(toTiming(book, [1, 3])).toEqual({ from: 't2', to: 't4' })
  })
})

describe('Aufenthalte', () => {
  const stay = (id: string, place: string, timing: object): Fact => ({ kind: 'stay', id, person: 'a', place, timing })

  it('teilt ab hier und lässt davor alles stehen', () => {
    const book = run(base([stay('s', 'x', {})]), (d) => moveStay(d, 'a', 'y', 2, 'hier'))
    expect(spans(book, 'stay')).toEqual(['x 0-1', 'y 2-4'])
  })

  it('ändert mit ganzer Phase den ganzen Aufenthalt', () => {
    expect(spans(run(base([stay('s', 'x', {})]), (d) => moveStay(d, 'a', 'y', 2, 'ganz')), 'stay')).toEqual(['y 0-4'])
  })

  it('führt einen Aufenthalt mit gleichem Nachbarn zusammen', () => {
    const book = run(base([stay('s1', 'x', { to: 't2' }), stay('s2', 'y', { from: 't3' })]), (d) => moveStay(d, 'a', 'y', 1, 'hier'))
    expect(spans(book, 'stay')).toEqual(['x 0-0', 'y 1-4'])
  })

  it('legt ohne Aufenthalt einen bis zum nächsten eigenen an', () => {
    const book = run(base([stay('s', 'x', { from: 't4' })]), (d) => moveStay(d, 'a', 'y', 1, 'hier'))
    expect(spans(book, 'stay')).toEqual(['x 3-4', 'y 1-2'])
  })

  it('bricht ab, wenn die Person schon dort ist', () => {
    expect(produce(base([stay('s', 'x', {})]), (d) => moveStay(d, 'a', 'x', 1, 'hier'))).toBeUndefined()
  })
})

describe('Richtung beim Verbinden', () => {
  const relation = (from: string, to: string, type: string, timing: object = {}): Fact => ({ kind: 'relation', id: `${from}${to}`, from, to, phases: [{ id: `${from}${to}1`, timing, type, strength: 3 }] })

  it('legt eine gerichtete Beziehung vom gezogenen zum Ziel an', () => {
    expect(rels(run(base(), (d) => connect(d, 'b', 'a', 'love', 1, 'hier')))).toEqual(['b>a: love 1-4'])
  })

  it('lässt eine gerichtete Gegenrichtung unberührt', () => {
    const book = run(base([relation('a', 'b', 'love')]), (d) => connect(d, 'b', 'a', 'love', 1, 'hier'))
    expect(rels(book)).toEqual(['a>b: love 0-4', 'b>a: love 1-4'])
  })

  it('beendet eine andersherum gespeicherte ungerichtete Beziehung, wenn die neue Art gerichtet ist', () => {
    const book = run(base([relation('a', 'b', 'friends')]), (d) => connect(d, 'b', 'a', 'love', 2, 'hier'))
    expect(rels(book)).toEqual(['a>b: friends 0-1', 'b>a: love 2-4'])
  })

  it('ändert eine ungerichtete Beziehung in beliebiger Richtung ab hier', () => {
    const book = run(base([relation('a', 'b', 'love')]), (d) => connect(d, 'a', 'b', 'friends', 3, 'hier'))
    expect(rels(book)).toEqual(['a>b: love 0-2, friends 3-4'])
  })
})

describe('Orte', () => {
  it('speichert die Lage relativ zum Elternort', () => {
    const child = place('k', 1, { phases: [{ id: 'k-l', timing: {}, parent: 'y', x: 1, y: 0, images: [] }] })
    const book = run(base([], { places: [place('x'), place('y', 6), child] }), (d) => movePlace(d, 'k', 0, 8, 1, 'ganz'))
    expect(worldPosition(book, 'k', 0)).toEqual({ x: 8, y: 1 })
    expect(book.places[2]!.phases[0]).toMatchObject({ parent: 'y', x: 2, y: 1 })
  })

  it('behält die Weltposition, wenn der Elternort gelöscht wird', () => {
    const child = place('k', 1, { phases: [{ id: 'k-l', timing: {}, parent: 'y', x: 1, y: 0, images: [] }] })
    const book = run(base([], { places: [place('x'), place('y', 6), child] }), (d) => removeElement(d, 'y'))
    expect(worldPosition(book, 'k', 0)).toEqual({ x: 7, y: 0 })
  })
})

describe('Anlegen', () => {
  it('legt Elemente mit unbenutzter Farbe an, Events zum aktuellen Zeitpunkt', () => {
    let id = ''
    const book = run(base(), (d) => void (id = create(d, 'event', 2, 'Fest')))
    expect(book.events[0]).toMatchObject({ id, title: 'Fest', timing: { at: 't3' }, color: '#f87171' })
  })

  it('fügt einen Zeitpunkt direkt nach dem aktuellen ein', () => {
    const book = run(base(), (d) => void create(d, 'timePoint', 1))
    expect(timeline(book).map((t) => t.name)).toEqual(['T1', 'T2', 'Neuer Zeitpunkt', 'T3', 'T4', 'T5'])
  })
})

describe('Zeitpunkte', () => {
  it('sortiert um', () => {
    expect(timeline(run(base(), (d) => moveTimePoint(d, 4, 0))).map((t) => t.id)).toEqual(['t5', 't1', 't2', 't3', 't4'])
  })

  it('verhindert ein Umsortieren, das eine Zeitangabe rückwärts laufen ließe', () => {
    const book = base([{ kind: 'stay', id: 's', person: 'a', place: 'x', timing: { from: 't2', to: 't4' } }])
    expect(produce(book, (d) => moveTimePoint(d, 3, 0))).toEqual({ blocked: 'Aufenthalt von a in x: Zeitangabe endet vor ihrem Beginn' })
  })

  it('rückt Spannen auf den Nachbarn und löscht, was nur dort gilt', () => {
    const book = base([
      { kind: 'stay', id: 's1', person: 'a', place: 'x', timing: { from: 't2', to: 't3' } },
      { kind: 'stay', id: 's2', person: 'b', place: 'x', timing: { at: 't3' } },
    ])
    expect(dependents(book, 't3')).toEqual(['1 Einträge gelten nur hier und werden gelöscht', '1 Zeitangaben rücken auf den Nachbarn'])
    const after = run(book, (d) => removeElement(d, 't3'))
    expect(after.facts.map((f) => [f.id, 'timing' in f && f.timing])).toEqual([['s1', { at: 't2' }]])
  })
})

describe('Löschen', () => {
  const book = base(
    [
      { kind: 'stay', id: 's', person: 'a', place: 'x', timing: {} },
      { kind: 'relation', id: 'r', from: 'a', to: 'b', phases: [{ id: 'r1', timing: {}, type: 'love', strength: 3, causedBy: 'e' }] },
      { kind: 'participation', id: 'p', actor: 'b', event: 'e' },
    ],
    { events: [{ id: 'e', title: 'Fest', color: '#000000', description: '', result: '', timing: { at: 't1' }, place: 'x', images: [] }] },
  )

  it('listet Abhängigkeiten für den Dialog', () => {
    expect(dependents(book, 'a')).toEqual(['Aufenthalt: x', 'Beziehung: b'])
    expect(dependents(book, 'x')).toEqual(['Aufenthalt: a', '„Fest“ verliert den Ort'])
  })

  it('löscht abhängige Fakten mit und entfernt Auslöser', () => {
    expect(run(book, (d) => removeElement(d, 'a')).facts.map((f) => f.id)).toEqual(['p'])
    const withoutEvent = run(book, (d) => removeElement(d, 'e'))
    expect(withoutEvent.facts.map((f) => f.id)).toEqual(['s', 'r'])
    expect((withoutEvent.facts[1] as Relation).phases[0]!.causedBy).toBeUndefined()
  })

  it('löscht Beziehungen, deren einzige Art wegfällt', () => {
    expect(run(book, (d) => removeElement(d, 'love')).facts.map((f) => f.id)).toEqual(['s', 'p'])
  })
})
