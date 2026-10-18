import { Spotlight, type SpotlightActionGroupData } from '@mantine/spotlight'
import { elementColor } from '../colors'
import { bounds, type Book, type ElementKind, type Selection, type TimePoint } from '../model'

interface SearchProps {
  book: Book
  points: TimePoint[]
  onSelect: (selection: Selection) => void
  onJump: (index: number) => void
}

/** Suche über Personen, Gruppen, Orte, Events und Zeitpunkte (Strg+K) */
export function Search({ book, points, onSelect, onJump }: SearchProps) {
  const group = (kind: ElementKind, name: string, items: { id: string; label: string; description: string }[], onPick?: (id: string) => void): SpotlightActionGroupData => ({
    group: name,
    actions: items.map((e) => ({
      id: e.id,
      label: e.label,
      description: e.description,
      leftSection: <span className="dot" style={{ background: elementColor(book, e.id) }} />,
      onClick: () => {
        onPick?.(e.id)
        onSelect({ kind, id: e.id })
      },
    })),
  })
  const named = (list: { id: string; name: string; description: string }[]) => list.map((e) => ({ id: e.id, label: e.name, description: e.description }))

  const actions: SpotlightActionGroupData[] = [
    group('person', 'Personen', named(book.persons)),
    group('group', 'Gruppen', named(book.groups)),
    group('place', 'Orte', named(book.places)),
    group(
      'event',
      'Events',
      book.events.map((e) => ({ id: e.id, label: e.title, description: e.description })),
      (id) => onJump(bounds(book, book.events.find((e) => e.id === id)!.timing)[0]),
    ),
    {
      group: 'Zeitpunkte',
      actions: points.map((t, i) => ({
        id: t.id,
        label: `${i + 1}. ${t.name}`,
        description: t.dateLabel,
        onClick: () => onJump(i),
      })),
    },
  ]

  return (
    <Spotlight
      actions={actions}
      shortcut={['mod + K', '/']}
      nothingFound="Nichts gefunden"
      highlightQuery
      searchProps={{ placeholder: 'Person, Gruppe, Ort, Event oder Zeitpunkt …' }}
    />
  )
}
