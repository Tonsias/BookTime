import { useEffect, useState, type ReactNode } from 'react'
import { Anchor, Badge, Box, CloseButton, Group, Image, Paper, ScrollArea, Stack, Text, Timeline, Title } from '@mantine/core'
import {
  bounds,
  elementColor,
  factTiming,
  factsAt,
  findElement,
  imageAt,
  involvedIds,
  placeChain,
  phaseAt,
  type Book,
  type ElementKind,
  type Fact,
  type RelationPhase,
  type Relation,
  type Selection,
  type StoryEvent,
  type TimePoint,
  type Timing,
} from '../model'

interface FocusPanelProps {
  book: Book
  imageUrl: (file: string) => Promise<string | undefined>
  points: TimePoint[]
  current: number
  selection: Selection
  onSelect: (selection: Selection | null) => void
  onJump: (index: number) => void
}

const KIND_LABELS: Record<ElementKind, string> = { person: 'Person', group: 'Gruppe', place: 'Ort', event: 'Event' }

type Entry = { fact: Fact; phase?: RelationPhase; start: number }

const entries = (book: Book, keep: (fact: Fact, phase: RelationPhase | undefined, start: number) => boolean): Entry[] =>
  book.facts
    .flatMap<Entry>((fact) =>
      fact.kind === 'relation'
        ? fact.phases.map((phase) => ({ fact, phase, start: bounds(book, phase.timing)[0] }))
        : [{ fact, start: bounds(book, factTiming(book, fact))[0] }],
    )
    .filter((e) => keep(e.fact, e.phase, e.start))
    .sort((a, b) => a.start - b.start)

/** Detailpanel zur Auswahl mit Stand, Verlauf und klickbaren Querverweisen */
export function FocusPanel(props: FocusPanelProps) {
  const { book, current, selection, onSelect } = props
  const found = findElement(book, selection.id)
  if (!found) return null
  const image = imageAt(book, selection.id, current)

  return (
    <Paper className="overlay focus-panel" radius="md" withBorder shadow="lg">
      <CloseButton className="focus-close" onClick={() => onSelect(null)} aria-label="Schließen" />
      <ScrollArea.Autosize mah="calc(100vh - 220px)" p="md">
        <Stack gap="md">
          <div>
            <Group gap="xs">
              <span className="dot" style={{ background: elementColor(book, selection.id) }} />
              <Title order={3}>{found.label}</Title>
              <Badge variant="light" color="gray">
                {KIND_LABELS[found.kind]}
              </Badge>
            </Group>
            <Markdown dimmed>{found.element.description}</Markdown>
          </div>
          <BookImage file={image?.file} alt={found.label} imageUrl={props.imageUrl} />
          {found.kind === 'event' ? <EventDetails {...props} event={found.element as StoryEvent} /> : <ElementDetails {...props} kind={found.kind} />}
          {found.element.note && (
            <Section title="Notiz">
              <Markdown>{found.element.note}</Markdown>
            </Section>
          )}
        </Stack>
      </ScrollArea.Autosize>
    </Paper>
  )
}

function BookImage({ file, alt, imageUrl }: { file?: string; alt: string; imageUrl: FocusPanelProps['imageUrl'] }) {
  const [loaded, setLoaded] = useState<{ file: string; url?: string }>()
  useEffect(() => {
    if (file) imageUrl(file).then((url) => setLoaded({ file, url }))
  }, [file, imageUrl])
  const url = loaded?.file === file ? loaded?.url : undefined
  return url ? (
    <Image src={url} radius="sm" alt={alt} />
  ) : (
    <Box className="image-placeholder">
      <Text size="xs" c="dimmed">
        {file && loaded?.file !== file ?'Bild wird geladen …' : 'Kein Bild zu diesem Zeitpunkt'}
      </Text>
    </Box>
  )
}

function ElementDetails(props: FocusPanelProps & { kind: ElementKind }) {
  const { book, points, current, selection, kind, onJump } = props
  const id = selection.id
  // Wer in einem Unterort ist, ist auch im Ort selbst
  const involves = (fact: Fact, i: number) =>
    involvedIds(fact).includes(id) || (kind === 'place' && fact.kind === 'stay' && placeChain(book, fact.place, i).some((p) => p.id === id))

  const now = factsAt(book, current).filter((f) => involves(f, current))
  const history = entries(book, (fact, _phase, start) => involves(fact, start))
  const active = history.filter((h) => h.start <= current).length - 1

  return (
    <>
      <Section title={`Stand: ${current + 1}. ${points[current].name}`}>
        {now.length ? (
          <Stack gap={6}>
            {now.map((fact) => (
              <FactText key={fact.id} {...props} fact={fact} phase={fact.kind === 'relation' ? phaseAt(book, fact.phases, current) : undefined} />
            ))}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">
            Zu diesem Zeitpunkt nichts verknüpft.
          </Text>
        )}
      </Section>

      <Section title="Verlauf">
        <Timeline active={active} bulletSize={16} lineWidth={2}>
          {history.map(({ fact, phase }) => (
            <Timeline.Item key={phase?.id ?? fact.id} title={<TimingLink book={book} timing={phase?.timing ?? factTiming(book, fact)} onJump={onJump} />}>
              <FactText {...props} fact={fact} phase={phase} />
            </Timeline.Item>
          ))}
        </Timeline>
      </Section>
    </>
  )
}

function EventDetails(props: FocusPanelProps & { event: StoryEvent }) {
  const { book, event, onJump } = props
  const ref = (id: string) => <Ref {...props} id={id} />
  const participants = book.facts.filter((f) => f.kind === 'participation' && f.event === event.id)
  const caused = entries(book, (fact, phase) => (phase ?? (fact as { causedBy?: string })).causedBy === event.id)

  return (
    <>
      <Stack gap={6}>
        <Row label="Zeit">
          <TimingLink book={book} timing={event.timing} onJump={onJump} />
        </Row>
        <Row label="Ort">{event.place ? ref(event.place) : '–'}</Row>
      </Stack>
      <Section title="Beteiligt">
        <Stack gap={4}>
          {participants.map((f) => (
            <FactText key={f.id} {...props} fact={f} />
          ))}
        </Stack>
      </Section>
      <Section title="Ergebnis">
        <Markdown>{event.result}</Markdown>
        <Stack gap={4} mt={6}>
          {caused.map(({ fact, phase }) => (
            <FactText key={phase?.id ?? fact.id} {...props} fact={fact} phase={phase} />
          ))}
        </Stack>
      </Section>
    </>
  )
}

function FactText(props: FocusPanelProps & { fact: Fact; phase?: RelationPhase }) {
  const { fact, phase } = props
  const ref = (id: string) => <Ref {...props} id={id} />
  let text: ReactNode
  switch (fact.kind) {
    case 'stay':
      text = <>{ref(fact.person)} in {ref(fact.place)}</>
      break
    case 'journey':
      text = <>{ref(fact.person)} unterwegs {ref(fact.origin)} → {ref(fact.destination)}</>
      break
    case 'participation':
      text = <>{ref(fact.actor)} bei {ref(fact.event)}{fact.role && ` (${fact.role})`}</>
      break
    case 'membership':
      text = <>{ref(fact.person)} in {ref(fact.group)}{fact.role && ` (${fact.role})`}</>
      break
    case 'relation':
      text = <RelationText {...props} relation={fact} phase={phase} />
      break
  }
  const note = phase?.note ?? fact.note
  return (
    <div>
      <Text size="sm" component="div">
        {text}
      </Text>
      {note && (
        <Text size="xs" c="dimmed" fs="italic">
          {note}
        </Text>
      )}
    </div>
  )
}

function RelationText(props: FocusPanelProps & { relation: Relation; phase?: RelationPhase }) {
  const { book, relation, phase } = props
  const type = book.relationTypes.find((t) => t.id === phase?.type)
  return (
    <>
      <Ref {...props} id={relation.from} /> {type?.directed ? '→' : '↔'} <Ref {...props} id={relation.to} />:{' '}
      {type && (
        <Badge size="xs" variant="outline" color={type.color}>
          {type.name} · {phase?.strength}
        </Badge>
      )}
    </>
  )
}

function TimingLink({ book, timing, onJump }: { book: Book; timing: Timing; onJump: (i: number) => void }) {
  const [start, end] = bounds(book, timing)
  const last = book.timePoints.length - 1
  const text = start === end ? `${start + 1}` : start === 0 && end === last ? 'immer' : `${start + 1}–${end + 1}`
  return (
    <Anchor component="button" type="button" fw={600} size="sm" onClick={() => onJump(start)}>
      {text}
    </Anchor>
  )
}

function Ref(props: FocusPanelProps & { id: string }) {
  const { book, id, onSelect } = props
  const found = findElement(book, id)
  if (!found) return <>{id}</>
  return (
    <Anchor component="button" type="button" size="sm" fw={600} c={elementColor(book, id)} onClick={() => onSelect({ kind: found.kind, id })}>
      {found.label}
    </Anchor>
  )
}

function Markdown({ children, dimmed }: { children: string; dimmed?: boolean }) {
  return (
    <Text size="sm" c={dimmed ? 'dimmed' : undefined} mt={4} style={{ whiteSpace: 'pre-wrap' }}>
      {children}
    </Text>
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
