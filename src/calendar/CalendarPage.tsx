import { useState, type ReactNode } from 'react'
import { ActionIcon, Alert, Anchor, Button, Container, Group, NativeSelect, Paper, Stack, Table, Text, TextInput, Title } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { calendarOf } from '../calendar'
import { addEra, dateUses, moveCalendarEntry, removeCalendarEntry, setCalendar, type Recipe } from '../edit/ops'
import { useEditor } from '../edit/useEditor'
import type { Book, Calendar } from '../model'
import { useActiveBook, type ActiveBook } from '../storage/active'
import { ErrorPage } from '../ui/ErrorView'
import { DateText } from '../ui/fields'

const SAVE_TEXT = { saved: 'Gespeichert', saving: 'Speichert …', error: 'Speichern fehlgeschlagen' }

/** Seite kalender.html: Kalender des angezeigten Buchs bearbeiten (Festlegungen 29 und 30 des Kalenders) */
export function CalendarPage() {
  const active = useActiveBook()
  if (!active) return null
  if (active instanceof Error) return <ErrorPage error={active} />
  return <CalendarEditor active={active} />
}

function CalendarEditor({ active }: { active: ActiveBook }) {
  const [message, setMessage] = useState<string>()
  const editor = useEditor(active, () => setMessage('Die Arbeitskopie wurde in einem anderen Tab geändert und neu geladen.'))
  const { book } = editor
  const cal = calendarOf(book)
  const change = (label: string, recipe: Recipe) => {
    const result = editor.apply(label, recipe, { selection: null, current: 0 })
    setMessage(!result.ok && result.blocked ? `Nicht möglich: ${result.blocked}` : undefined)
  }
  const edit = (label: string, update: (cal: Calendar) => void) => change(label, (d) => setCalendar(d, update))
  const remove = (key: 'month' | 'era', index: number, name: string) => {
    const uses = dateUses(book, key, index + 1)
    if (uses && !(key === 'era' && cal.eras.length === 1)) return setMessage(`${name} wird von ${uses} ${uses === 1 ? 'Datum' : 'Daten'} genutzt und lässt sich nicht entfernen.`)
    change(`${name} entfernt`, (d) => removeCalendarEntry(d, key, index))
  }
  useHotkeys([
    ['mod+Z', () => editor.undo()],
    ['mod+Y', () => editor.redo()],
  ])
  const empty = !cal.months.length && !cal.weekdays.length && !cal.eras.length

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={2}>BookTime · Kalender</Title>
          <Group>
            <Anchor href="./">Zur Buchansicht</Anchor>
            <Anchor href="github.html">GitHub</Anchor>
          </Group>
        </Group>
        <Text size="sm" c="dimmed">
          {book.title} · {active.repo ?? 'Beispielbuch · lokal'} · <span role="status">{SAVE_TEXT[editor.status]}</span> · Rückgängig mit Strg+Z
        </Text>
        {message && (
          <Alert color="yellow" withCloseButton onClose={() => setMessage(undefined)}>
            {message}
          </Alert>
        )}
        {empty && (
          <Alert color="gray">Dieses Buch hat keinen eigenen Kalender, Daten bestehen nur aus Jahreszahlen. Lege Monate, Wochentage oder Zeitrechnungen an, um ihn einzurichten.</Alert>
        )}

        <Section title="Monate" sub="Reihenfolge und Länge eines Jahres. Ohne Monate haben Daten nur ein Jahr.">
          <Entries
            head={['Name', 'Tage']}
            empty="Keine Monate, Daten haben nur ein Jahr."
            rows={cal.months.map((m, i) => [
              <Field key="name" label="Name des Monats" value={m.name} onCommit={(name) => edit('Monat umbenannt', (c) => void (c.months[i]!.name = name))} />,
              <Field key="days" label="Tage" value={m.days} width={80} onCommit={(days) => edit('Tage geändert', (c) => void (c.months[i]!.days = Math.max(1, Math.round(Number(days)) || 1)))} />,
            ])}
            onMove={(i, j) => change('Monat verschoben', (d) => moveCalendarEntry(d, 'month', i, j))}
            onRemove={(i) => remove('month', i, cal.months[i]!.name)}
          />
          <Add onClick={() => edit('Monat angelegt', (c) => void c.months.push({ name: `Monat ${c.months.length + 1}`, days: 30 }))}>+ Monat</Add>
        </Section>

        <Section title="Wochentage" sub="Erscheinen bei Daten mit Jahr, Monat und Tag.">
          <Entries
            head={['Name']}
            empty="Keine Wochentage."
            rows={cal.weekdays.map((w, i) => [<Field key="name" label="Name des Wochentags" value={w} onCommit={(name) => edit('Wochentag umbenannt', (c) => void (c.weekdays[i] = name))} />])}
            onMove={(i, j) => edit('Wochentag verschoben', (c) => void c.weekdays.splice(j, 0, ...c.weekdays.splice(i, 1)))}
            onRemove={(i) => edit('Wochentag entfernt', (c) => void (c.weekdays.splice(i, 1), (c.firstWeekday = Math.min(c.firstWeekday, Math.max(0, c.weekdays.length - 1)))))}
          />
          <Add onClick={() => edit('Wochentag angelegt', (c) => void c.weekdays.push(`Tag ${c.weekdays.length + 1}`))}>+ Wochentag</Add>
          {cal.weekdays.length > 0 && (
            <Group gap="sm">
              <Text size="sm" c="dimmed">
                Erster Tag von Jahr 1{cal.eras[0] ? ` ${cal.eras[0].short}` : ''} ist ein
              </Text>
              <NativeSelect
                size="xs"
                aria-label="Wochentag des ersten Tags"
                value={String(cal.firstWeekday)}
                data={cal.weekdays.map((w, k) => ({ value: String(k), label: w }))}
                onChange={(e) => edit('Ersten Wochentag geändert', (c) => void (c.firstWeekday = Number(e.currentTarget.value)))}
              />
            </Group>
          )}
        </Section>

        <Section title="Zeitrechnungen" sub="Folgen aufeinander, jede beginnt bei Jahr 1. Die letzte läuft noch und hat keine Länge. Davor wird rückwärts gezählt.">
          <Entries
            head={['Name', 'Kürzel', 'Jahre']}
            empty="Keine Zeitrechnungen, Jahre sind einfache Zahlen (auch 0 und negativ)."
            first={
              cal.eras.length > 0 && [
                <Field key="name" label="Name vor der ersten Zeitrechnung" value={cal.before.name} onCommit={(name) => edit('Zeitrechnung umbenannt', (c) => void (c.before.name = name))} />,
                <Field key="short" label="Kürzel vor der ersten Zeitrechnung" value={cal.before.short} width={90} onCommit={(short) => edit('Kürzel geändert', (c) => void (c.before.short = short))} />,
                <Text key="years" size="xs" c="dimmed">
                  rückwärts gezählt
                </Text>,
              ]
            }
            rows={cal.eras.map((e, i) => [
              <Field key="name" label="Name der Zeitrechnung" value={e.name} onCommit={(name) => edit('Zeitrechnung umbenannt', (c) => void (c.eras[i]!.name = name))} />,
              <Field key="short" label="Kürzel" value={e.short} width={90} onCommit={(short) => edit('Kürzel geändert', (c) => void (c.eras[i]!.short = short))} />,
              e.years === undefined ? (
                <Text key="years" size="xs" c="dimmed">
                  läuft noch
                </Text>
              ) : (
                <Field key="years" label="Jahre" value={e.years} width={80} onCommit={(years) => edit('Länge geändert', (c) => void (c.eras[i]!.years = Math.max(1, Math.round(Number(years)) || 1)))} />
              ),
            ])}
            onMove={(i, j) => change('Zeitrechnung verschoben', (d) => moveCalendarEntry(d, 'era', i, j))}
            onRemove={(i) => remove('era', i, cal.eras[i]!.name)}
          />
          <Add onClick={() => change('Zeitrechnung angelegt', addEra)}>+ Zeitrechnung</Add>
        </Section>

        <Section title="Vorschau">
          <Preview book={book} cal={cal} />
        </Section>
      </Stack>
    </Container>
  )
}

function Preview({ book, cal }: { book: Book; cal: Calendar }) {
  const first = [...book.timePoints].sort((a, b) => a.order - b.order)[0]
  const dates = book.timePoints.filter((t) => t.date).length + book.persons.filter((p) => p.born).length
  const days = cal.months.reduce((sum, m) => sum + m.days, 0)
  const rows: [string, ReactNode][] = [
    ['Jahr', cal.months.length ? `${days} Tage in ${cal.months.length} Monaten` : 'nur Jahreszahlen'],
    ['Woche', cal.weekdays.length ? `${cal.weekdays.length} Tage` : '–'],
    [first ? `Zeitpunkt 1 „${first.name}“` : 'Zeitpunkt 1', first?.date ? <DateText key="date" cal={cal} date={first.date} /> : 'ohne Datum'],
    ['Daten im Buch', String(dates)],
  ]
  return (
    <Table withRowBorders={false} verticalSpacing={2}>
      <Table.Tbody>
        {rows.map(([label, value]) => (
          <Table.Tr key={label}>
            <Table.Td w={220}>
              <Text size="sm" c="dimmed">
                {label}
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">{value}</Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <div>
          <Title order={4}>{title}</Title>
          {sub && (
            <Text size="sm" c="dimmed">
              {sub}
            </Text>
          )}
        </div>
        {children}
      </Stack>
    </Paper>
  )
}

const Add = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <Button variant="default" size="xs" w="fit-content" onClick={onClick}>
    {children}
  </Button>
)

interface EntriesProps {
  head: string[]
  rows: ReactNode[][]
  first?: ReactNode[] | false
  empty: string
  onMove: (from: number, to: number) => void
  onRemove: (index: number) => void
}

function Entries({ head, rows, first, empty, onMove, onRemove }: EntriesProps) {
  if (!rows.length)
    return (
      <Text size="sm" c="dimmed">
        {empty}
      </Text>
    )
  const cells = (row: ReactNode[]) => row.map((cell, k) => <Table.Td key={k}>{cell}</Table.Td>)
  return (
    <Table withRowBorders={false} verticalSpacing={4}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th w={32} />
          {head.map((h) => (
            <Table.Th key={h} fw={400} c="dimmed" fz="xs">
              {h}
            </Table.Th>
          ))}
          <Table.Th w={1} />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {first && (
          <Table.Tr>
            <Table.Td c="dimmed">0</Table.Td>
            {cells(first)}
            <Table.Td />
          </Table.Tr>
        )}
        {rows.map((row, i) => (
          <Table.Tr key={i}>
            <Table.Td c="dimmed">{i + 1}</Table.Td>
            {cells(row)}
            <Table.Td>
              <Group gap={2} wrap="nowrap">
                <ActionIcon variant="subtle" color="gray" aria-label="nach oben" disabled={i === 0} onClick={() => onMove(i, i - 1)}>
                  ↑
                </ActionIcon>
                <ActionIcon variant="subtle" color="gray" aria-label="nach unten" disabled={i === rows.length - 1} onClick={() => onMove(i, i + 1)}>
                  ↓
                </ActionIcon>
                <ActionIcon variant="subtle" color="red" aria-label="entfernen" onClick={() => onRemove(i)}>
                  ✕
                </ActionIcon>
              </Group>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}

// Übernimmt beim Verlassen oder mit Enter, damit nicht jeder Tastendruck ein Rückgängig-Schritt wird
function Field({ label, value, width, onCommit }: { label: string; value: string | number; width?: number; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState<string>()
  const commit = () => {
    if (draft !== undefined && draft.trim() && draft !== String(value)) onCommit(draft.trim())
    setDraft(undefined)
  }
  return (
    <TextInput
      size="xs"
      w={width}
      aria-label={label}
      inputMode={typeof value === 'number' ? 'numeric' : undefined}
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setDraft(undefined)
      }}
    />
  )
}
