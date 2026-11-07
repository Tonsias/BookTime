import { CloseButton, Paper, ScrollArea } from '@mantine/core'
import { useUi } from '../context'
import { ElementPanel } from './ElementPanel'
import { BookPanel, RelationTypePanel, TimePointPanel } from './OtherPanels'

/** Fokus-Panel: Editor für das, was ausgewählt ist (Festlegung 33) */
export function Panel() {
  const { book, selection, select } = useUi()
  if (!selection) return null
  const { kind, id } = selection
  const point = kind === 'timePoint' ? book.timePoints.find((t) => t.id === id) : undefined
  const type = kind === 'relationType' ? book.relationTypes.find((t) => t.id === id) : undefined
  const content = kind === 'book' ? <BookPanel /> : point ? <TimePointPanel point={point} /> : type ? <RelationTypePanel type={type} /> : <ElementPanel id={id} />
  if ((kind === 'timePoint' && !point) || (kind === 'relationType' && !type)) return null
  return (
    <Paper className="overlay focus-panel" radius="md" withBorder shadow="lg" role="complementary" aria-label="Bearbeiten">
      <CloseButton className="focus-close" onClick={() => select(null)} aria-label="Schließen" />
      <ScrollArea.Autosize mah="calc(100vh - 230px)" p="md" pt={40} type="auto" scrollbars="y" offsetScrollbars="y">
        {content}
      </ScrollArea.Autosize>
    </Paper>
  )
}
