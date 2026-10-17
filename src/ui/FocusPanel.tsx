import type { ReactNode } from 'react'
import { Anchor, Badge, CloseButton, Group, Paper, ScrollArea, Stack, Text, Timeline, Title } from '@mantine/core'
import { RELATION_COLORS, involvedIds, type Book, type Change, type Entity, type Selection, type SliceState } from '../model'

interface FocusPanelProps {
  book: Book
  states: SliceState[]
  current: number
  selection: Selection
  onSelect: (selection: Selection | null) => void
  onJump: (index: number) => void
}

export function FocusPanel(props: FocusPanelProps) {
  const { book, selection, onSelect } = props
  const entity = selection.kind === 'entity' ? book.entities.find((e) => e.id === selection.id) : undefined
  const eventIndex = selection.kind === 'event' ? book.events.findIndex((e) => e.id === selection.id) : -1

  return (
    <Paper className="overlay focus-panel" radius="md" withBorder shadow="lg">
      <CloseButton className="focus-close" onClick={() => onSelect(null)} aria-label="Schließen" />
      <ScrollArea.Autosize mah="calc(100vh - 220px)" p="md">
        {entity && <EntityDetails {...props} entity={entity} />}
        {eventIndex >= 0 && <EventDetails {...props} index={eventIndex} />}
      </ScrollArea.Autosize>
    </Paper>
  )
}

function EntityDetails(props: FocusPanelProps & { entity: Entity }) {
  const { book, states, current, entity, onSelect, onJump } = props
  const state = states[current]
  const ref = (id: string) => <Ref book={book} id={id} onSelect={onSelect} />

  const history = book.events
    .map((event, index) => ({ event, index, changes: event.changes.filter((c) => involvedIds(c).includes(entity.id)) }))
    .filter((h) => h.changes.length > 0)
  const active = history.filter((h) => h.index <= current).length - 1

  return (
    <Stack gap="md">
      <div>
        <Group gap="xs">
          <span className="dot" style={{ background: entity.color }} />
          <Title order={3}>{entity.name}</Title>
          <Badge variant="light" color="gray">
            {entity.kind === 'person' ? 'Person' : 'Ort'}
          </Badge>
        </Group>
        <Text size="sm" c="dimmed" mt={4}>
          {entity.description}
        </Text>
      </div>

      <Section title={`Stand: ${current + 1}. ${book.events[current].title}`}>
        {entity.kind === 'person' ? (
          state.location[entity.id] ? (
            <Stack gap={6}>
              <Row label="Ort">{ref(state.location[entity.id])}</Row>
              <Row label="Gefühl">{state.mood[entity.id] ?? '–'}</Row>
              <Row label="Beziehungen">
                <Stack gap={4}>
                  {state.relations
                    .filter((r) => r.a === entity.id || r.b === entity.id)
                    .map((r) => (
                      <Group key={r.a + r.b} gap={6}>
                        {ref(r.a === entity.id ? r.b : r.a)}
                        <Badge size="xs" variant="outline" color={RELATION_COLORS[r.kind]}>
                          {r.kind}
                        </Badge>
                      </Group>
                    ))}
                </Stack>
              </Row>
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              Zu diesem Zeitpunkt nicht in der Geschichte.
            </Text>
          )
        ) : (
          <Row label="Anwesend">
            <Group gap={8}>
              {Object.entries(state.location)
                .filter(([, place]) => place === entity.id)
                .map(([person]) => (
                  <span key={person}>{ref(person)}</span>
                ))}
            </Group>
          </Row>
        )}
      </Section>

      <Section title="Verlauf">
        <Timeline active={active} bulletSize={16} lineWidth={2}>
          {history.map(({ event, index, changes }) => (
            <Timeline.Item
              key={event.id}
              title={
                <Anchor component="button" type="button" fw={600} size="sm" onClick={() => onJump(index)}>
                  {index + 1}. {event.title}
                </Anchor>
              }
            >
              {changes.map((c, k) => (
                <ChangeText key={k} book={book} change={c} onSelect={onSelect} />
              ))}
            </Timeline.Item>
          ))}
        </Timeline>
      </Section>
    </Stack>
  )
}

function EventDetails(props: FocusPanelProps & { index: number }) {
  const { book, index, onSelect } = props
  const event = book.events[index]
  return (
    <Stack gap="md">
      <div>
        <Badge variant="light">Ereignis {index + 1}</Badge>
        <Title order={3} mt={6}>
          {event.title}
        </Title>
        <Text size="sm" c="dimmed" mt={4}>
          {event.description}
        </Text>
      </div>
      <Section title="Änderungen">
        <Stack gap={8}>
          {event.changes.map((c, k) => (
            <ChangeText key={k} book={book} change={c} onSelect={onSelect} />
          ))}
        </Stack>
      </Section>
    </Stack>
  )
}

function ChangeText({ book, change: c, onSelect }: { book: Book; change: Change; onSelect: (s: Selection) => void }) {
  const ref = (id: string) => <Ref book={book} id={id} onSelect={onSelect} />
  let text: ReactNode
  switch (c.type) {
    case 'appear':
      text = <>{ref(c.entity)} taucht auf in {ref(c.at)}</>
      break
    case 'move':
      text = <>{ref(c.entity)} → {ref(c.to)}</>
      break
    case 'exit':
      text = <>{ref(c.entity)} verlässt die Geschichte</>
      break
    case 'mood':
      text = <>{ref(c.entity)} fühlt sich {c.mood}</>
      break
    case 'relation':
      text = (
        <>
          {ref(c.a)} ↔ {ref(c.b)}:{' '}
          {c.kind ? (
            <Badge size="xs" variant="outline" color={RELATION_COLORS[c.kind]}>
              {c.kind}
            </Badge>
          ) : (
            'Beziehung endet'
          )}
        </>
      )
      break
  }
  return (
    <div>
      <Text size="sm">{text}</Text>
      {c.note && (
        <Text size="xs" c="dimmed" fs="italic">
          {c.note}
        </Text>
      )}
    </div>
  )
}

function Ref({ book, id, onSelect }: { book: Book; id: string; onSelect: (s: Selection) => void }) {
  const entity = book.entities.find((e) => e.id === id)
  if (!entity) return <>{id}</>
  return (
    <Anchor component="button" type="button" size="sm" fw={600} c={entity.color} onClick={() => onSelect({ kind: 'entity', id })}>
      {entity.name}
    </Anchor>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb={6}>
        {title}
      </Text>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group gap="sm" align="flex-start" wrap="nowrap">
      <Text size="sm" c="dimmed" w={90} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <div>{children}</div>
    </Group>
  )
}
