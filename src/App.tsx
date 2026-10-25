import { useMemo, useState } from 'react'
import { ActionIcon, Anchor, Button, Group, Kbd, Paper, Popover, SegmentedControl, Slider, Stack, Text, Title } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { spotlight } from '@mantine/spotlight'
import { hints, type Hint } from './checks'
import { addFirstTimePoint, useActiveBook, type ActiveBook } from './storage/active'
import { findElement, focusSet, timeline } from './model'
import { computeLayout } from './scene/layout'
import { Scene } from './scene/Scene'
import { ErrorPage, ErrorView } from './ui/ErrorView'
import { FocusPanel } from './ui/FocusPanel'
import { Search } from './ui/Search'
import type { Selection, View } from './ui/types'

/** Hauptansicht: lädt das aktive Buch und zeigt es */
function App() {
  const active = useActiveBook()
  if (!active) return null
  if (active instanceof Error) return <ErrorPage error={active} />
  return active.book.timePoints.length ? <BookView active={active} /> : <EmptyBook active={active} />
}

/** Ohne Zeitpunkt gibt es keine Ebene, also nichts anzuzeigen */
function EmptyBook({ active }: { active: ActiveBook }) {
  const { repo, errors } = active
  return (
    <ErrorView
      title="Dieses Buch hat noch keine Zeitpunkte"
      message={
        <>
          Ohne Zeitpunkt lässt sich nichts anzeigen. Lege einen ersten Zeitpunkt „Anfang“ an und committe ihn danach auf der GitHub-Seite.
          {errors.length > 0 && ` Außerdem sind ${errors.length} Dateien fehlerhaft, darunter vielleicht Zeitpunkte.`}
        </>
      }
      fixes={[
        ...(repo ? [{ label: 'Ersten Zeitpunkt anlegen', run: () => addFirstTimePoint(repo).then(() => location.reload()) }] : []),
        { label: 'Zur GitHub-Seite', href: 'github.html' },
      ]}
    />
  )
}

/** 3D-Szene mit Werkzeugleiste, Zeitregler, Fokus-Panel und Suche */
function BookView({ active }: { active: ActiveBook }) {
  const { book } = active
  const [view, setView] = useState<View>('raum')
  const [current, setCurrent] = useState(0)
  const [selection, setSelection] = useState<Selection | null>(null)

  const points = useMemo(() => timeline(book), [book])
  const layout = useMemo(() => computeLayout(book, points.length), [book, points])
  const focus = useMemo(() => focusSet(book, selection?.id ?? null), [book, selection])
  const notes = useMemo(() => hints(book, active.images), [book, active.images])

  const last = points.length - 1
  const point = points[current] ?? points[0]!

  useHotkeys([
    ['1', () => setView('raum')],
    ['2', () => setView('netz')],
    ['3', () => setView('zeit')],
    ['Escape', () => setSelection(null)],
  ])

  return (
    <div className="app">
      <Scene book={book} imageUrl={active.imageUrl} points={points} layout={layout} current={current} view={view} selection={selection} focus={focus} onSelect={setSelection} onJump={setCurrent} />

      <Paper className="overlay toolbar" p="md" radius="md" withBorder shadow="lg">
        <Stack gap="sm">
          <div>
            <Title order={4}>{book.title}</Title>
            <Group gap="xs">
              <Text size="xs" c="dimmed">
                {active.repo ?? 'Beispielbuch'}
              </Text>
              <Anchor href="github.html" size="xs">
                GitHub
              </Anchor>
            </Group>
            {active.errors.length > 0 && (
              <Anchor href="github.html" size="xs" c="red" display="block">
                {active.errors.length} Dateien fehlerhaft
              </Anchor>
            )}
            <HintList
              hints={notes}
              onOpen={(hint) => {
                const id = hint.ids[0]
                const kind = id && findElement(book, id)?.kind
                if (id && kind) setSelection({ kind, id })
                setCurrent(hint.at)
              }}
            />
          </div>
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

      {selection && <FocusPanel book={book} hints={notes} imageUrl={active.imageUrl} points={points} current={current} selection={selection} onSelect={setSelection} onJump={setCurrent} />}

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
            label={(i) => points[i]?.name}
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

function HintList({ hints, onOpen }: { hints: Hint[]; onOpen: (hint: Hint) => void }) {
  if (!hints.length) return null
  return (
    <Popover width={360} position="bottom-start" shadow="lg">
      <Popover.Target>
        <Anchor component="button" type="button" size="xs" c="yellow">
          {hints.length} Hinweise
        </Anchor>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap={6} mah={320} style={{ overflowY: 'auto' }}>
          {hints.map((hint, i) => (
            <Anchor key={i} component="button" type="button" size="sm" ta="left" c="dimmed" onClick={() => onOpen(hint)}>
              {hint.at + 1}. {hint.text}
            </Anchor>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

export default App
