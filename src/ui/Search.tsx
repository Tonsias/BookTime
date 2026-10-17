import { Spotlight, type SpotlightActionGroupData } from '@mantine/spotlight'
import type { Book, Selection } from '../model'

interface SearchProps {
  book: Book
  onSelect: (selection: Selection) => void
  onJump: (index: number) => void
}

export function Search({ book, onSelect, onJump }: SearchProps) {
  const entityGroup = (kind: 'person' | 'place', group: string): SpotlightActionGroupData => ({
    group,
    actions: book.entities
      .filter((e) => e.kind === kind)
      .map((e) => ({
        id: e.id,
        label: e.name,
        description: e.description,
        leftSection: <span className="dot" style={{ background: e.color }} />,
        onClick: () => onSelect({ kind: 'entity', id: e.id }),
      })),
  })

  const actions: SpotlightActionGroupData[] = [
    entityGroup('person', 'Personen'),
    entityGroup('place', 'Orte'),
    {
      group: 'Ereignisse',
      actions: book.events.map((e, i) => ({
        id: e.id,
        label: `${i + 1}. ${e.title}`,
        description: e.description,
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
      searchProps={{ placeholder: 'Person, Ort oder Ereignis …' }}
    />
  )
}
