import { describe, expect, it } from 'vitest'
import { hintKey, hints, type HintRule } from '../checks'
import type { Book, Fact } from '../model'
import { fixesFor } from './fixes'
import { produce } from './ops'

const point = (id: string, order: number) => ({ id, name: id, order })
const place = (id: string, extra: object = {}) => ({ id, name: id, color: '#000000', description: '', existence: {}, images: [], phases: [{ id: `${id}-l`, timing: {}, x: 0, y: 0, images: [] }], ...extra })
const person = (id: string, existence: object = {}) => ({ id, name: id, color: '#000000', description: '', existence, images: [] })
const event = (id: string, timing: object, extra: object = {}) => ({ id, title: id, color: '#000000', description: '', result: '', timing, images: [], ...extra })

const base = (extra: Partial<Book>): Book => ({
  title: 'Test',
  acceptedHints: [],
  timePoints: ['t1', 't2', 't3', 't4'].map((id, k) => point(id, k + 1)),
  persons: [person('p'), person('q')],
  groups: [],
  places: [place('a'), place('b')],
  events: [],
  relationTypes: [{ id: 'f', name: 'Freunde', category: '', directed: false, color: '#00ff00' }],
  facts: [],
  ...extra,
})

const stay = (id: string, placeId: string, timing: object): Fact => ({ kind: 'stay', id, person: 'p', place: placeId, timing })

/** Je Regel ein Buch, das genau diesen Hinweis auslöst */
const CASES: Record<HintRule, Book> = {
  clash: base({ facts: [stay('s1', 'a', { to: 't3' }), stay('s2', 'b', { from: 't2' })] }),
  'outside-existence': base({ persons: [person('p', { from: 't2', to: 't3' }), person('q')], facts: [stay('s', 'a', { to: 't3' })] }),
  'before-cause': base({ events: [event('e', { at: 't3' })], facts: [{ ...stay('s', 'a', { from: 't2' }), causedBy: 'e' } as Fact] }),
  'participation-time': base({ events: [event('e', { at: 't2' })], facts: [{ kind: 'participation', id: 'x', actor: 'q', event: 'e', timing: { from: 't2', to: 't3' } }] }),
  elsewhere: base({ events: [event('e', { at: 't2' }, { place: 'b' })], facts: [stay('s', 'a', {}), { kind: 'participation', id: 'x', actor: 'p', event: 'e' }] }),
  'event-place': base({ places: [place('a', { existence: { from: 't3' } }), place('b')], events: [event('e', { at: 't2' }, { place: 'a' })] }),
  'relation-overlap': base({
    facts: [
      { kind: 'relation', id: 'r1', from: 'p', to: 'q', phases: [{ id: 'r1a', timing: { to: 't3' }, type: 'f', strength: 3 }] },
      { kind: 'relation', id: 'r2', from: 'q', to: 'p', phases: [{ id: 'r2a', timing: { from: 't2' }, type: 'f', strength: 2 }] },
    ],
  }),
  'place-gap': base({ places: [place('a', { phases: [{ id: 'l1', timing: { to: 't2' }, x: 0, y: 0, images: [] }] }), place('b')] }),
  'parent-missing': base({ places: [place('a', { existence: { from: 't3' } }), place('b', { phases: [{ id: 'l', timing: {}, parent: 'a', x: 1, y: 0, images: [] }] })] }),
  'outside-radius': base({ places: [place('a', { radius: 2 }), place('b', { phases: [{ id: 'l', timing: {}, parent: 'a', x: 5, y: 0, images: [] }] })] }),
  'image-time': base({ persons: [person('p', { to: 't2' }), person('q')], facts: [], places: [place('a'), place('b')], groups: [] }),
  'image-missing': base({ persons: [{ ...person('p'), images: [{ id: 'i', file: 'images/p-iiii.png', order: 1 }] }, person('q')] }),
}
CASES['image-time'].persons[0]!.images.push({ id: 'i', file: 'images/p-iiii.png', order: 1, timing: { from: 't2' } })

describe.each(Object.entries(CASES) as [HintRule, Book][])('Lösungen für %s', (rule, book) => {
  const available = ['images/x-xxxx.png']
  const hint = hints(book, available).find((h) => h.rule === rule)!

  it('erzeugt genau diesen Hinweis mit Lösungen und Vorschau', () => {
    expect(hint).toBeDefined()
    const plan = fixesFor(book, hint)
    expect(plan.fixes.length).toBeGreaterThanOrEqual(2)
    for (const fix of plan.fixes) expect(fix.preview).not.toBe('')
  })

  it('jede Lösung beseitigt den Hinweis ohne neues Verbot', () => {
    for (const fix of fixesFor(book, hint).fixes.filter((f) => f.recipe)) {
      const result = produce(book, fix.recipe!)
      expect(result && 'book' in result, fix.label).toBe(true)
      if (result && 'book' in result) expect(hints(result.book, available).map(hintKey), fix.label).not.toContain(hintKey(hint))
    }
  })
})

it('Bild neu hochladen ist eine Aufgabe der Oberfläche', () => {
  const book = CASES['image-missing']
  const plan = fixesFor(book, hints(book, [])[0]!)
  expect(plan.fixes[0]).toMatchObject({ upload: 'i' })
})
