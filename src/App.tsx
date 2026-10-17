import { useMemo, useState } from 'react'
import { ActionIcon, Button, Group, Kbd, Paper, SegmentedControl, Slider, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { spotlight } from '@mantine/spotlight'
import { RELATION_COLORS, computeStates, focusSet, type RelationKind, type Selection, type View } from './model'
import { sampleBook } from './sampleBook'
import { computeLayout } from './scene/layout'
import { Scene } from './scene/Scene'
import { FocusPanel } from './ui/FocusPanel'
import { Search } from './ui/Search'

const book = sampleBook

function App() {
  const [view, setView] = useState<View>('raum')
  const [current, setCurrent] = useState(0)
  const [selection, setSelection] = useState<Selection | null>(null)

  const states = useMemo(() => computeStates(book), [])
  const layout = useMemo(() => computeLayout(book, states), [states])
  const focus = useMemo(() => focusSet(book, states, selection), [states, selection])

  const last = book.events.length - 1
  const jump = (index: number) => {
    setCurrent(index)
    setSelection({ kind: 'event', id: book.events[index].id })
  }

  useHotkeys([
    ['1', () => setView('raum')],
    ['2', () => setView('netz')],
    ['3', () => setView('zeit')],
    ['Escape', () => setSelection(null)],
  ])

  return (
    <div className="app">
      <Scene
        book={book}
        states={states}
        layout={layout}
        current={current}
        view={view}
        selection={selection}
        focus={focus}
        onSelect={setSelection}
        onJump={jump}
      />

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
            {(Object.keys(RELATION_COLORS) as RelationKind[]).map((kind) => (
              <Group key={kind} gap={4}>
                <span className="legend-line" style={{ background: RELATION_COLORS[kind] }} />
                <Text size="xs" c="dimmed">
                  {kind}
                </Text>
              </Group>
            ))}
          </Group>
        </Stack>
      </Paper>

      {selection && <FocusPanel book={book} states={states} current={current} selection={selection} onSelect={setSelection} onJump={jump} />}

      <Paper className="overlay timebar" p="md" radius="md" withBorder shadow="lg">
        <UnstyledButton onClick={() => jump(current)}>
          <Text size="sm" fw={600}>
            {current + 1}. {book.events[current].title}
          </Text>
        </UnstyledButton>
        <Group gap="md" wrap="nowrap" mt="xs" mb="md">
          <ActionIcon variant="default" onClick={() => setCurrent(current - 1)} disabled={current === 0} aria-label="Vorheriges Ereignis">
            ‹
          </ActionIcon>
          <Slider
            flex={1}
            min={0}
            max={last}
            step={1}
            value={current}
            onChange={setCurrent}
            label={(i) => book.events[i].title}
            marks={book.events.map((_, i) => ({ value: i, label: i + 1 }))}
          />
          <ActionIcon variant="default" onClick={() => setCurrent(current + 1)} disabled={current === last} aria-label="Nächstes Ereignis">
            ›
          </ActionIcon>
        </Group>
      </Paper>

      <Search book={book} onSelect={setSelection} onJump={jump} />
    </div>
  )
}

export default App
