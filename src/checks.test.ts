import { describe, expect, it } from 'vitest'
import { hintKey, hints, openHints, problems } from './checks'
import type { Book } from './model'

const point = (id: string, order: number) => ({ id, name: id, order })
const place = (id: string, extra: object = {}) => ({ id, name: id, color: '#000000', description: '', existence: {}, images: [], phases: [{ id: `${id}-l`, timing: {}, x: 0, y: 0, images: [] }], ...extra })

const base = (extra: Partial<Book> = {}): Book => ({
  title: 'Test',
  acceptedHints: [],
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
    expect(hints(book)).toEqual([{ rule: 'clash', ids: ['s1', 's2'], els: ['p'], at: 1, text: 'Pia ist gleichzeitig in a und in b (nur 2)' }])
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
    expect(hints(book).map((h) => [h.rule, h.ids, h.text])).toEqual([['elsewhere', ['x'], 'Pia ist bei „Fest“ (1), aber in a']])
  })

  it('erkennt einen Fakt außerhalb der Existenz', () => {
    const book = base({
      persons: [{ id: 'p', name: 'Pia', color: '#000000', description: '', existence: { to: 't1' }, images: [] }],
      facts: [{ kind: 'stay', id: 's', person: 'p', place: 'a', timing: { at: 't2' } }],
    })
    expect(hints(book).map((h) => [h.at, h.text])).toEqual([[1, 'Aufenthalt von Pia in a (nur 2) liegt außerhalb der Existenz von Pia (nur 1)']])
  })

  it('erkennt überlappende gleiche ungerichtete Beziehungen in beide Richtungen', () => {
    const relation = (id: string, from: string, to: string) => ({ kind: 'relation' as const, id, from, to, phases: [{ id: `${id}-1`, timing: {}, type: 'f', strength: 3 as const }] })
    const book = base({
      persons: [...base().persons, { id: 'q', name: 'Quinn', color: '#000000', description: '', existence: {}, images: [] }],
      facts: [relation('r1', 'p', 'q'), relation('r2', 'q', 'p')],
    })
    expect(hints(book).map((h) => [h.ids, h.text])).toEqual([[['r1-1', 'r2-1'], 'Zwei Beziehungen „Freunde“ zwischen Pia und Quinn überschneiden sich (immer)']])
  })

  it('meldet Bilder und Hintergründe, die im Repo fehlen', () => {
    const book = base({
      timePoints: [{ ...point('t1', 1), background: { id: 'h', file: 'images/karte-hhhh.svg', x: 0, y: 0, width: 10 } }],
      persons: [{ id: 'p', name: 'Pia', color: '#000000', description: '', existence: {}, images: [{ id: 'i', file: 'images/pia-iiii.png', order: 0 }] }],
    })
    expect(hints(book, ['images/pia-iiii.png']).map((h) => h.text)).toEqual(['Hintergrund images/karte-hhhh.svg fehlt im Repo'])
    expect(hints(book)).toEqual([])
  })

  it('erkennt Lücken in den Orts-Phasen', () => {
    const phases = [{ id: 'x', timing: { at: 't1' }, x: 0, y: 0, images: [] }]
    expect(hints(base({ places: [place('a', { phases })] })).map((h) => [h.at, h.text])).toEqual([[1, 'a hat ab 2 keine Lage']])
  })
})

describe('Gewollte Hinweise', () => {
  const book = base({
    persons: [{ id: 'p', name: 'Pia', color: '#000000', description: '', existence: { to: 't1' }, images: [] }],
    facts: [{ kind: 'stay', id: 's', person: 'p', place: 'a', timing: {} }],
  })

  it('erkennt einen Hinweis über Regel und IDs', () => {
    expect(hints(book).map(hintKey)).toEqual(['outside-existence:s,p'])
  })

  it('blendet als gewollt markierte Hinweise aus', () => {
    expect(openHints(book)).toHaveLength(1)
    expect(openHints({ ...book, acceptedHints: [{ rule: 'outside-existence', ids: ['s', 'p'] }] })).toEqual([])
  })
})
