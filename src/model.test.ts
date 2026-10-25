import { describe, expect, it } from 'vitest'
import { backgroundAt, bounds, covers, factsAt, findElement, imageAt, phaseAt, placeChain, timeline, worldPosition, type Book } from './model'
import { filesToBook } from './storage/format'
import { sampleFiles } from './storage/sample'

const book: Book = filesToBook(sampleFiles).book
const id = (name: string) => [...book.persons, ...book.places, ...book.timePoints].find((e) => e.name === name)!.id

describe('Zeitlogik', () => {
  it('ordnet Zeitpunkte nach order', () => {
    expect(timeline(book).map((t) => t.name)).toEqual(['Ankunft in Velmar', 'Der gestohlene Brief', 'Flucht in den Wald', 'Verrat auf Ostfels', 'Das Konzil'])
  })

  it('löst Zeitpunkt, offene und geschlossene Spannen auf', () => {
    expect(bounds(book, { at: id('Flucht in den Wald') })).toEqual([2, 2])
    expect(bounds(book, {})).toEqual([0, 4])
    expect(bounds(book, { from: id('Der gestohlene Brief') })).toEqual([1, 4])
    expect(bounds(book, { to: id('Verrat auf Ostfels') })).toEqual([0, 3])
  })

  it('schließt die Grenzen einer Spanne ein', () => {
    const timing = { from: id('Der gestohlene Brief'), to: id('Flucht in den Wald') }
    expect([0, 1, 2, 3].map((i) => covers(book, timing, i))).toEqual([false, true, true, false])
  })

  it('findet die gültige Phase', () => {
    const relation = book.facts.find((f) => f.kind === 'relation' && f.phases.length === 3)!
    if (relation.kind !== 'relation') throw new Error()
    expect(phaseAt(book, relation.phases, 0)?.strength).toBe(4)
    expect(phaseAt(book, relation.phases, 2)?.strength).toBe(3)
  })

  it('liefert Fakten pro Zeitpunkt und hält sie zwischengespeichert', () => {
    const anna = id('Anna')
    const stays = factsAt(book, 2).filter((f) => f.kind === 'stay' && f.person === anna)
    expect(stays).toHaveLength(1)
    expect(factsAt(book, 2)).toBe(factsAt(book, 2))
  })
})

describe('Orte und Bilder', () => {
  it('rechnet die Weltposition über die Elternkette', () => {
    const taverne = id('Taverne zum Anker')
    expect(placeChain(book, taverne, 0).map((p) => p.name)).toEqual(['Taverne zum Anker', 'Velmar'])
    const pos = worldPosition(book, taverne, 0)!
    expect(pos.x).toBeCloseTo(-4.2)
    expect(pos.y).toBeCloseTo(4.6)
  })

  it('gibt einen Hintergrund an spätere Zeitpunkte weiter', () => {
    expect(backgroundAt(book, 0)?.file).toBe('images/ankunft-in-velmar-w4k2.svg')
    expect(backgroundAt(book, 4)).toBe(backgroundAt(book, 0))
  })

  it('wählt das erste zum Zeitpunkt gültige Bild', () => {
    const anna = id('Anna')
    const images = [
      { id: 'b1', file: 'a.svg', order: 0, timing: { to: id('Der gestohlene Brief') } },
      { id: 'b2', file: 'b.svg', order: 1 },
    ]
    const withImages: Book = { ...book, persons: book.persons.map((p) => (p.id === anna ? { ...p, images } : p)) }
    expect(imageAt(withImages, anna, 0)?.file).toBe('a.svg')
    expect(imageAt(withImages, anna, 3)?.file).toBe('b.svg')
  })

  it('findet Elemente aller Arten über die ID', () => {
    expect(findElement(book, id('Velmar'))?.kind).toBe('place')
    expect(findElement(book, 'gibt-es-nicht')).toBeUndefined()
  })
})
