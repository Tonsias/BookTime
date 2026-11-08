import { describe, expect, it } from 'vitest'
import type { Book } from '../model'
import { computeLayout } from './layout'

const named = (id: string) => ({ id, name: id, color: '#000000', description: '', existence: {}, images: [] })
const stay = (person: string) => ({ kind: 'stay' as const, id: `s-${person}`, person, place: 'x', timing: {} })
const book: Book = {
  title: 'Test',
  acceptedHints: [],
  timePoints: [{ id: 't1', name: 'T1', order: 1 }],
  persons: ['a', 'b', 'c'].map(named),
  groups: [],
  places: [{ ...named('x'), radius: 5, phases: [{ id: 'xl', timing: {}, x: 0, y: 0, images: [] }] }],
  events: [],
  relationTypes: [],
  facts: ['a', 'b', 'c'].map(stay),
}

describe('Personen im Ort', () => {
  it('verteilt sie gleichmäßig auf einem Kreis, der mit dem Ring wächst', () => {
    const layout = computeLayout(book, 1)
    const [a, b, c] = ['a', 'b', 'c'].map((id) => layout.persons.get(id)![0]!)
    for (const p of [a!, b!, c!]) expect(Math.hypot(p[0], p[1])).toBeCloseTo(3)
    const side = (p: number[], q: number[]) => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!)
    expect(side(a!, b!)).toBeCloseTo(side(b!, c!))
    expect(side(b!, c!)).toBeCloseTo(side(c!, a!))
  })
})
