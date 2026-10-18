import { useMemo, useState } from 'react'
import { ActionIcon, Button, Group, Kbd, Paper, SegmentedControl, Slider, Stack, Text, Title } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { spotlight } from '@mantine/spotlight'
import { focusSet, timeline, type Selection, type View } from './model'
import { sampleBook } from './sampleBook'
import { computeLayout } from './scene/layout'
import { Scene } from './scene/Scene'
import { FocusPanel } from './ui/FocusPanel'
import { Search } from './ui/Search'

const book = sampleBook

/** Hauptansicht: 3D-Szene mit Werkzeugleiste, Zeitregler, Fokus-Panel und Suche */
function App() {
  const [view, setView] = useState<View>('raum')
  const [current, setCurrent] = useState(0)
  const [selection, setSelection] = useState<Selection | null>(null)

  const points = useMemo(() => timeline(book), [])
  const layout = useMemo(() => computeLayout(book, points.length), [points])
  const focus = useMemo(() => focusSet(book, selection), [selection])

  const last = points.length - 1
  const point = points[current]

  useHotkeys([
    ['1', () => setView('raum')],
    ['2', () => setView('netz')],
    ['3', () => setView('zeit')],
    ['Escape', () => setSelection(null)],
  ])

  return (
    <div className="app">
      <Scene book={book} points={points} layout={layout} current={current} view={view} selection={selection} focus={focus} onSelect={setSelection} onJump={setCurrent} />

      <Paper className="overlay toolbar" p="md" radius="md" withBorder shadow="lg">
        <Stack gap="sm">
          <Title order={4}>{book.title}</Title>
          <SegmentedControl
            value={view}
            onChange={(v) => {
              setView(v as View)
              // Fokus freigeben, sonst greifen Tastenkürzel (Strg+K, 1–3) im Radio-Input nicht
              ;(document.activeElement as HTMLElement | null)?.blur()
            }}
            data={[
              { value: 'raum', label: 'Raum' },
              { value: 'netz', label: 'Netz' },
              { value: 'zeit', label: 'Zeit' },
            ]}
          />
          <Button variant="default" onClick={spotlight.open} rightSection={<Kbd size="xs">Strg K</Kbd>}>
            Suchen
          </Button>
          <Group gap="xs">
            {book.relationTypes.map((type) => (
              <Group key={type.id} gap={4}>
                <span className="legend-line" style={{ background: type.color }} />
                <Text size="xs" c="dimmed">
                  {type.name}
                </Text>
              </Group>
            ))}
          </Group>
        </Stack>
      </Paper>

      {selection && <FocusPanel book={book} points={points} current={current} selection={selection} onSelect={setSelection} onJump={setCurrent} />}

      <Paper className="overlay timebar" p="md" radius="md" withBorder shadow="lg">
        <Text size="sm" fw={600}>
          {current + 1}. {point.name}
          {point.dateLabel && (
            <Text span size="xs" c="dimmed" fw={400} ml="xs">
              {point.dateLabel}
            </Text>
          )}
        </Text>
        <Group gap="md" wrap="nowrap" mt="xs" mb="md">
          <ActionIcon variant="default" onClick={() => setCurrent(current - 1)} disabled={current === 0} aria-label="Vorheriger Zeitpunkt">
            ‹
          </ActionIcon>
          <Slider
            flex={1}
            min={0}
            max={last}
            step={1}
            value={current}
            onChange={setCurrent}
            label={(i) => points[i].name}
            marks={points.map((_, i) => ({ value: i, label: i + 1 }))}
          />
          <ActionIcon variant="default" onClick={() => setCurrent(current + 1)} disabled={current === last} aria-label="Nächster Zeitpunkt">
            ›
          </ActionIcon>
        </Group>
      </Paper>

      <Search book={book} points={points} onSelect={setSelection} onJump={setCurrent} />
    </div>
  )
}

export default App
