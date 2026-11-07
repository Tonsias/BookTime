import { describe, expect, it } from 'vitest'
import type { Book } from '../model'
import { describeDrop, hitAt } from './hits'
import { computeLayout } from './layout'

const named = (id: string) => ({ id, name: id.toUpperCase(), color: '#000000', description: '', existence: {}, images: [] })
const book: Book = {
  title: 'Test',
  acceptedHints: [],
  timePoints: [{ id: 't1', name: 'T1', order: 1 }],
  persons: [named('a'), named('b')],
  groups: [],
  places: [{ ...named('x'), radius: 3, phases: [{ id: 'xl', timing: {}, x: 0, y: 0, images: [] }] }, { ...named('y'), phases: [{ id: 'yl', timing: {}, x: 10, y: 0, images: [] }] }],
  events: [{ id: 'e', title: 'Fest', color: '#000000', description: '', result: '', timing: {}, place: 'y', images: [] }],
  relationTypes: [],
  facts: [{ kind: 'stay', id: 's', person: 'a', place: 'x', timing: {} }],
}
const layout = computeLayout(book, 1)
const a = layout.persons.get('a')![0]!

describe('Treffer im Netz', () => {
  it('trifft zuerst Personen, dann Events', () => {
    expect(hitAt(book, layout, 0, a, 'ring')).toEqual({ kind: 'person', id: 'a' })
    expect(hitAt(book, layout, 0, [10, 0], 'inside')).toEqual({ kind: 'event', id: 'e' })
  })

  it('fasst Orte nur am Ring an, als Ziel zählt das ganze Innere', () => {
    expect(hitAt(book, layout, 0, [0, -3], 'ring')).toEqual({ kind: 'place', id: 'x' })
    expect(hitAt(book, layout, 0, [0, -1.5], 'ring')).toBeUndefined()
    expect(hitAt(book, layout, 0, [0, -1.5], 'inside')).toEqual({ kind: 'place', id: 'x' })
  })

  it('überspringt das gezogene Element selbst', () => {
    expect(hitAt(book, layout, 0, a, 'inside', 'a')).toEqual({ kind: 'place', id: 'x' })
  })
})

describe('Wirkung beim Loslassen', () => {
  const person = { kind: 'person' as const, id: 'a' }
  it('beschreibt Aufenthalt, Beziehung, Teilnahme und Event-Ort', () => {
    expect(describeDrop(book, 0, 'hier', person, { kind: 'place', id: 'y' })?.text).toBe('A → Y: Aufenthalt ab 1')
    expect(describeDrop(book, 0, 'ganz', person, { kind: 'place', id: 'y' })?.text).toBe('A → Y: Aufenthalt ganze Phase')
    expect(describeDrop(book, 0, 'hier', person, { kind: 'person', id: 'b' })?.kind).toBe('relation')
    expect(describeDrop(book, 0, 'hier', person, { kind: 'event', id: 'e' })?.text).toBe('A nimmt teil an „Fest“')
    expect(describeDrop(book, 0, 'hier', { kind: 'event', id: 'e' }, { kind: 'place', id: 'x' })?.text).toBe('„Fest“ findet in X statt')
  })

  it('hat ohne Wirkung kein Ergebnis', () => {
    expect(describeDrop(book, 0, 'hier', person, { kind: 'place', id: 'x' })).toBeUndefined()
    expect(describeDrop(book, 0, 'hier', person, undefined)).toBeUndefined()
  })
})
