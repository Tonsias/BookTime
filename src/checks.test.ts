import { describe, expect, it } from 'vitest'
import { hints, problems } from './checks'
import type { Book } from './model'

const point = (id: string, order: number) => ({ id, name: id, order })
const place = (id: string, extra: object = {}) => ({ id, name: id, color: '#000000', description: '', existence: {}, images: [], phases: [{ id: `${id}-l`, timing: {}, x: 0, y: 0, images: [] }], ...extra })

const base = (extra: Partial<Book> = {}): Book => ({
  title: 'Test',
  timePoints: [point('t1', 1), point('t2', 2), point('t3', 3)],
  persons: [{ id: 'p', name: 'Pia', color: '#000000', description: '', existence: {}, images: [] }],
  groups: [],
  places: [place('a'), place('b')],
  events: [],
  relationTypes: [{ id: 'f', name: 'Freunde', category: 'Sozial', directed: false, color: '#000000' }],
  facts: [],
  ...extra,
})

describe('Verbote', () => {
  it('meldet eine rückwärts laufende Zeitangabe', () => {
    const book = base({ facts: [{ kind: 'stay', id: 's', person: 'p', place: 'a', timing: { from: 't3', to: 't1' } }] })
    expect(problems(book)).toEqual([{ id: 's', reason: 'Zeitangabe endet vor ihrem Beginn' }])
  })

  it('meldet überlappende Phasen', () => {
    const phases = [
      { id: 'x', timing: { to: 't2' }, x: 0, y: 0, images: [] },
      { id: 'y', timing: { from: 't2' }, x: 1, y: 1, images: [] },
    ]
    expect(problems(base({ places: [place('a', { phases })] }))).toEqual([{ id: 'a', reason: 'Phasen überschneiden sich' }])
  })

  it('meldet einen Ort, der in sich selbst liegt', () => {
    const inside = (id: string, parent: string) => place(id, { phases: [{ id: `${id}-l`, timing: {}, parent, x: 0, y: 0, images: [] }] })
    expect(problems(base({ places: [inside('a', 'b'), inside('b', 'a')] })).map((p) => p.id).sort()).toEqual(['a', 'b'])
  })
})

describe('Hinweise', () => {
  it('erkennt zwei Orte zur selben Zeit', () => {
    const book = base({
      facts: [
        { kind: 'stay', id: 's1', person: 'p', place: 'a', timing: {} },
        { kind: 'stay', id: 's2', person: 'p', place: 'b', timing: { at: 't2' } },
      ],
    })
    expect(hints(book)).toEqual([{ ids: ['p'], at: 1, text: 'Pia ist gleichzeitig an mehreren Orten oder unterwegs' }])
  })

  it('lässt Aufenthalt und Reise am Grenzpunkt zu', () => {
    const book = base({
      facts: [
        { kind: 'stay', id: 's1', person: 'p', place: 'a', timing: { to: 't2' } },
        { kind: 'journey', id: 'j', person: 'p', origin: 'a', destination: 'b', timing: { from: 't2', to: 't3' } },
        { kind: 'stay', id: 's2', person: 'p', place: 'b', timing: { at: 't3' } },
      ],
    })
    expect(hints(book)).toEqual([])
  })

  it('erkennt Teilnahme, während die Person woanders ist', () => {
    const book = base({
      events: [{ id: 'e', title: 'Fest', color: '#000000', timing: { at: 't1' }, place: 'b', description: '', result: '', images: [] }],
      facts: [
        { kind: 'stay', id: 's', person: 'p', place: 'a', timing: {} },
        { kind: 'participation', id: 'x', actor: 'p', event: 'e' },
      ],
    })
    expect(hints(book).map((h) => h.text)).toEqual(['Pia ist bei „Fest“, aber woanders'])
  })

  it('erkennt einen Fakt außerhalb der Existenz', () => {
    const book = base({
      persons: [{ id: 'p', name: 'Pia', color: '#000000', description: '', existence: { to: 't1' }, images: [] }],
      facts: [{ kind: 'stay', id: 's', person: 'p', place: 'a', timing: { at: 't2' } }],
    })
    expect(hints(book).map((h) => [h.at, h.text])).toEqual([[1, 'Fakt liegt außerhalb der Existenz von Pia']])
  })

  it('erkennt überlappende gleiche ungerichtete Beziehungen in beide Richtungen', () => {
    const relation = (id: string, from: string, to: string) => ({ kind: 'relation' as const, id, from, to, phases: [{ id: `${id}-1`, timing: {}, type: 'f', strength: 3 as const }] })
    const book = base({
      persons: [...base().persons, { id: 'q', name: 'Quinn', color: '#000000', description: '', existence: {}, images: [] }],
      facts: [relation('r1', 'p', 'q'), relation('r2', 'q', 'p')],
    })
    expect(hints(book).map((h) => h.text)).toEqual(['Zwei gleiche ungerichtete Beziehungen überschneiden sich'])
  })

  it('erkennt Lücken in den Orts-Phasen', () => {
    const phases = [{ id: 'x', timing: { at: 't1' }, x: 0, y: 0, images: [] }]
    expect(hints(base({ places: [place('a', { phases })] })).map((h) => [h.at, h.text])).toEqual([[1, 'a hat zu dieser Zeit keine Lage']])
  })
})
