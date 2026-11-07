import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ActionIcon, Anchor, Button, Group, Kbd, Menu, Paper, SegmentedControl, Slider, Stack, Text, Title, Tooltip, UnstyledButton } from '@mantine/core'
import { spotlight } from '@mantine/spotlight'
import type { NewKind, Scope } from '../edit/ops'
import type { SaveStatus } from '../edit/useEditor'
import { covers } from '../model'
import type { Layout } from '../scene/layout'
import { useUi } from './context'
import type { View } from './types'

const NEW_ITEMS: [NewKind, string, string][] = [
  ['person', 'Person', 'P'],
  ['group', 'Gruppe', 'G'],
  ['place', 'Ort', 'O'],
  ['event', 'Event', 'E'],
  ['timePoint', 'Zeitpunkt nach diesem', 'Z'],
]

const SAVE_TEXT: Record<SaveStatus, string> = { saved: 'Gespeichert', saving: 'Speichert …', error: 'Speichern fehlgeschlagen' }

interface ToolbarProps {
  repo: string | null
  errors: number
  status: SaveStatus
  changes: number
  undoLabel?: string
  redoLabel?: string
  view: View
  newOpen: boolean
  onNewOpen: (open: boolean) => void
  onNew: (kind: NewKind) => void
  onView: (view: View) => void
  onUndo: () => void
  onRedo: () => void
}

/** Werkzeugleiste: Titel, Speicherstand, Änderungen, Hinweise, Rückgängig, Suche, Neu, Ansicht und Legende */
export function Toolbar(props: ToolbarProps) {
  const { book, hints, select, openHint } = useUi()
  const { repo, status, changes } = props
  const pending = changes ? `${changes} ${changes === 1 ? 'Änderung' : 'Änderungen'}` : 'Keine Änderungen'
  return (
    <Paper className="overlay toolbar" p="md" radius="md" withBorder shadow="lg">
      <Stack gap="sm">
        <div>
          <UnstyledButton className="book-title" onClick={() => select({ kind: 'book', id: '' })} aria-label="Buch bearbeiten">
            <Title order={4}>{book.title}</Title>
          </UnstyledButton>
          <Group gap="xs" mt={2}>
            <Text size="xs" c="dimmed">
              {repo ?? 'Beispielbuch · lokal'}
            </Text>
            <Text size="xs" c={status === 'error' ? 'red' : 'dimmed'} className={`save-status ${status}`} role="status">
              {SAVE_TEXT[status]}
            </Text>
          </Group>
          <Group gap="sm" mt={2}>
            {repo ? (
              <Anchor href="github.html" size="xs">
                {pending} · GitHub
              </Anchor>
            ) : changes ? (
              <Anchor component="button" type="button" size="xs" onClick={() => select({ kind: 'book', id: '' })}>
                {pending}
              </Anchor>
            ) : (
              <Text size="xs" c="dimmed">
                {pending}
              </Text>
            )}
            {hints.length > 0 && (
              <Anchor component="button" type="button" size="xs" c="yellow" onClick={() => openHint()}>
                {hints.length} {hints.length === 1 ? 'Hinweis' : 'Hinweise'} auflösen
              </Anchor>
            )}
            {props.errors > 0 && (
              <Anchor href="github.html" size="xs" c="red">
                {props.errors} Dateien fehlerhaft
              </Anchor>
            )}
          </Group>
        </div>
        <Group gap="xs" wrap="nowrap">
          <Tooltip label={props.undoLabel ? `Rückgängig: ${props.undoLabel} (Strg+Z)` : 'Nichts rückgängig zu machen'}>
            <ActionIcon variant="default" size="lg" onClick={props.onUndo} disabled={!props.undoLabel} aria-label="Rückgängig">
              ↶
            </ActionIcon>
          </Tooltip>
          <Tooltip label={props.redoLabel ? `Wiederholen: ${props.redoLabel} (Strg+Y)` : 'Nichts zu wiederholen'}>
            <ActionIcon variant="default" size="lg" onClick={props.onRedo} disabled={!props.redoLabel} aria-label="Wiederholen">
              ↷
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Suchen und anlegen (Strg+K)">
            <Button variant="default" flex={1} onClick={spotlight.open}>
              Suchen
            </Button>
          </Tooltip>
          <NewMenu {...props} />
        </Group>
        <SegmentedControl
          value={props.view}
          onChange={(v) => {
            props.onView(v as View)
            // Fokus freigeben, sonst greifen Tastenkürzel im Radio-Input nicht
            ;(document.activeElement as HTMLElement | null)?.blur()
          }}
          data={[
            { value: 'raum', label: 'Raum' },
            { value: 'netz', label: 'Netz' },
            { value: 'zeit', label: 'Zeit' },
          ]}
        />
        <Group gap={4}>
          {book.relationTypes.map((type) => (
            <UnstyledButton key={type.id} className="legend-item" onClick={() => select({ kind: 'relationType', id: type.id })}>
              <span className="legend-line" style={{ background: type.color }} />
              <Text size="xs" c="dimmed" span>
                {type.name}
              </Text>
            </UnstyledButton>
          ))}
          <UnstyledButton className="legend-item" aria-label="Neue Beziehungsart" onClick={() => props.onNew('relationType')}>
            <Text size="xs" c="dimmed" span>
              + Art
            </Text>
          </UnstyledButton>
        </Group>
      </Stack>
    </Paper>
  )
}

function NewMenu({ newOpen, onNewOpen, onNew }: ToolbarProps) {
  return (
    <Menu opened={newOpen} onChange={onNewOpen} position="bottom-end" shadow="lg" returnFocus={false}>
      <Menu.Target>
        <Button aria-label="Neu anlegen (N)">+ Neu</Button>
      </Menu.Target>
      <Menu.Dropdown
        onKeyDown={(e) => {
          const item = NEW_ITEMS.find(([, , key]) => key.toLowerCase() === e.key.toLowerCase())
          if (!item) return
          e.preventDefault()
          onNewOpen(false)
          onNew(item[0])
        }}
      >
        <Menu.Label>Neu</Menu.Label>
        {NEW_ITEMS.map(([kind, label, key]) => (
          <Menu.Item key={kind} onClick={() => onNew(kind)} rightSection={<Kbd size="xs">{key}</Kbd>}>
            {label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}

/** Zeitleiste mit Umschalter „Ab hier / Ganze Phase“ (Festlegung 14) */
export function Timebar({ onScope, onAdd }: { onScope: (scope: Scope) => void; onAdd: () => void }) {
  const { points, current, scope, jump, select } = useUi()
  const point = points[current]!
  const last = points.length - 1
  return (
    <Paper className="overlay timebar" p="md" radius="md" withBorder shadow="lg">
      <Group gap="xs" wrap="nowrap">
        <UnstyledButton className="timepoint-name" onClick={() => select({ kind: 'timePoint', id: point.id })} aria-label="Zeitpunkt bearbeiten">
          <Text size="sm" fw={600} span>
            {current + 1}. {point.name}
          </Text>
        </UnstyledButton>
        {point.dateLabel && (
          <Text span size="xs" c="dimmed">
            {point.dateLabel}
          </Text>
        )}
        <SegmentedControl
          ml="auto"
          size="xs"
          value={scope}
          onChange={(v) => {
            onScope(v as Scope)
            ;(document.activeElement as HTMLElement | null)?.blur()
          }}
          aria-label="Änderungen gelten"
          data={[
            { value: 'hier', label: 'Ab hier' },
            { value: 'ganz', label: 'Ganze Phase' },
          ]}
        />
      </Group>
      <Group gap="md" wrap="nowrap" mt="xs" mb="md">
        <ActionIcon variant="default" onClick={() => jump(current - 1)} disabled={current === 0} aria-label="Vorheriger Zeitpunkt">
          ‹
        </ActionIcon>
        <Slider flex={1} min={0} max={Math.max(last, 1)} disabled={last < 1} step={1} value={current} onChange={jump} label={(i) => points[i]?.name} marks={points.map((_, i) => ({ value: i, label: i + 1 }))} thumbLabel="Zeitpunkt" />
        <ActionIcon variant="default" onClick={() => jump(current + 1)} disabled={current === last} aria-label="Nächster Zeitpunkt">
          ›
        </ActionIcon>
        <Tooltip label="Zeitpunkt nach diesem einfügen">
          <ActionIcon variant="default" onClick={onAdd} aria-label="Zeitpunkt einfügen">
            +
          </ActionIcon>
        </Tooltip>
      </Group>
    </Paper>
  )
}

/** Leiste „Ohne Ort“: Personen ohne Position und Events ohne Ort auf dieser Ebene, zum Ziehen in die Szene (Festlegung 27) */
export function Tray({ layout, fresh, onGrab }: { layout: Layout; fresh: string | null; onGrab: (e: ReactPointerEvent, kind: 'person' | 'event', id: string) => void }) {
  const { book, current, select } = useUi()
  const [moved, setMoved] = useState(false)
  const persons = book.persons.filter((p) => covers(book, p.existence, current) && !layout.persons.get(p.id)?.[current])
  const events = book.events.filter((e) => covers(book, e.timing, current) && !e.place)
  if (!persons.length && !events.length) return null
  const chip = (kind: 'person' | 'event', id: string, name: string, color: string) => (
    <UnstyledButton
      key={id}
      className={`tray-chip ${fresh === id ? 'fresh' : ''}`}
      style={{ borderColor: color, color }}
      data-tray={id}
      title="Auf einen Ort ziehen"
      onPointerDown={(e) => {
        setMoved(false)
        onGrab(e, kind, id)
      }}
      onPointerMove={() => setMoved(true)}
      onClick={() => !moved && select({ kind, id })}
    >
      {kind === 'person' ? '●' : '◆'} {name}
    </UnstyledButton>
  )
  return (
    <div className="tray" aria-label="Ohne Ort">
      <Text span size="xs" c="dimmed">
        Ohne Ort auf {current + 1}:
      </Text>
      {persons.map((p) => chip('person', p.id, p.name, p.color))}
      {events.map((e) => chip('event', e.id, e.title, e.color))}
    </div>
  )
}
