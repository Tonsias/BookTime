import type { Book } from './model'

const PERSON_COLORS = ['#f87171', '#fb923c', '#e879f9', '#94a3b8', '#fde68a', '#2dd4bf', '#f9a8d4', '#a3e635']
const PLACE_COLORS = ['#38bdf8', '#7dd3fc', '#a78bfa', '#34d399', '#fbbf24', '#818cf8', '#6ee7b7']
const GROUP_COLORS = ['#cbd5e1', '#fca5a5', '#93c5fd']
/** Farbe der Event-Marker */
export const EVENT_COLOR = '#facc15'

const pick = (palette: string[], index: number) => (index < 0 ? undefined : palette[index % palette.length])

/** Anzeigefarbe eines Elements, fest nach seiner Reihenfolge im Buch */
export function elementColor(book: Book, id: string): string {
  return (
    pick(PERSON_COLORS, book.persons.findIndex((p) => p.id === id)) ??
    pick(PLACE_COLORS, book.places.findIndex((p) => p.id === id)) ??
    pick(GROUP_COLORS, book.groups.findIndex((g) => g.id === id)) ??
    EVENT_COLOR
  )
}
