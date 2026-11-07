import { useState } from 'react'
import { Badge, Group, Stack, Switch, Text, Timeline, UnstyledButton } from '@mantine/core'
import { addImage, allIds, byId, changeAt, moveStay, setText, toTiming } from '../../edit/ops'
import { newId } from '../../storage/format'
import { removeImage } from '../../edit/fixes'
import { bounds, covers, factTiming, factsAt, findElement, imageAt, involvedIds, phaseAt, placeChain, spanLabel, type Book, type ElementKind, type Fact, type Image, type Named, type Place, type StoryEvent } from '../../model'
import { useUi } from '../context'
import { ColorField, Inline, RefPicker, SpanField } from '../fields'
import { AddLink, FactEditor } from './Facts'
import { Clickable, BookImage, DeleteButton, DropZone, HintRows, NoteSection, NumberField, Ref, Row, Section, TextField } from './parts'
import { optionsOf, useCreate, when } from './lookup'

const KIND_LABELS: Record<ElementKind, string> = { person: 'Person', group: 'Gruppe', place: 'Ort', event: 'Event' }

/** Kopf eines Panels: Farbe, Name, Art */
export function PanelHeader({ id, name, color, badge, field = 'name' }: { id: string; name: string; color?: string; badge: string; field?: 'name' | 'title' }) {
  const { change } = useUi()
  return (
    <Group gap="xs" wrap="nowrap" pr={28}>
      {color && <ColorField value={color} onCommit={(c) => change('Farbe geändert', (d) => void (byId<{ color: string }>(d, id).color = c))} />}
      <Inline field={`name:${id}`} value={name} label="Name" className="panel-name" onCommit={(v) => v && change('Name geändert', (d) => void (byId<Record<string, string>>(d, id)[field] = v))} />
      <Badge variant="light" color="gray" style={{ flexShrink: 0 }}>
        {badge}
      </Badge>
    </Group>
  )
}

/** Editor für Person, Gruppe, Ort und Event */
export function ElementPanel({ id }: { id: string }) {
  const { book, current } = useUi()
  const found = findElement(book, id)
  if (!found) return null
  const element = found.element
  const image = imageAt(book, id, current)
  return (
    <Stack gap="md">
      <div>
        <PanelHeader id={id} name={found.label} color={element.color} badge={KIND_LABELS[found.kind]} field={found.kind === 'event' ? 'title' : 'name'} />
        <TextField id={id} field="description" value={element.description} label="Beschreibung" multiline dimmed />
      </div>
      {image && <BookImage file={image.file} alt={found.label} />}
      {found.kind === 'event' ? <EventDetails event={element as StoryEvent} /> : <NamedDetails id={id} kind={found.kind} />}
      <HintRows id={id} />
      <ImageSection id={id} name={found.label} images={element.images} />
      <NoteSection id={id} note={element.note} />
      <DeleteButton id={id} />
    </Stack>
  )
}

function NamedDetails({ id, kind }: { id: string; kind: Exclude<ElementKind, 'event'> }) {
  const { book, current, points, change } = useUi()
  const element = findElement(book, id)!.element as Named
  // Wer in einem Unterort ist, ist auch im Ort selbst
  const involves = (fact: Fact, i: number) => involvedIds(fact).includes(id) || (kind === 'place' && fact.kind === 'stay' && placeChain(book, fact.place, i).some((p) => p.id === id))
  const now = factsAt(book, current).filter((f) => involves(f, current))
  return (
    <>
      <Row label="Existiert">
        <SpanField span={bounds(book, element.existence)} label="Existenz" onCommit={(span) => change('Existenz geändert', (d) => void (byId<{ existence: unknown }>(d, id).existence = toTiming(d, span)))} />
      </Row>
      {kind === 'place' && <PlaceDetails place={book.places.find((p) => p.id === id)!} />}
      {kind !== 'place' && (
        <Section title={`Stand: ${current + 1}. ${points[current]?.name ?? ''}`} action={<AddLink me={id} person={kind === 'person'} />}>
          <Stack gap={2}>
            {kind === 'person' && !now.some((f) => f.kind === 'stay' || f.kind === 'journey') && <Nowhere id={id} />}
            {now.map((fact) => (
              <FactEditor key={fact.id} fact={fact} me={id} />
            ))}
            {kind === 'group' && !now.length && (
              <Text size="sm" c="dimmed">
                Zu diesem Zeitpunkt nichts verknüpft.
              </Text>
            )}
          </Stack>
        </Section>
      )}
      <History id={id} involves={involves} />
    </>
  )
}

function Nowhere({ id }: { id: string }) {
  const { book, current, scope, change } = useUi()
  const created = useCreate()
  const move = (d: Book, place: string) => void moveStay(d, id, place, current, scope)
  return (
    <div className="empty-hint">
      <Text size="sm" c="dimmed" span>
        Zu diesem Zeitpunkt nirgends. Aus der Leiste „Ohne Ort“ auf einen Ort ziehen oder{' '}
      </Text>
      <RefPicker label="Ort wählen" empty="Ort wählen" options={optionsOf(book, 'place')} onPick={(place) => change('Aufenthalt angelegt', (d) => move(d, place))} creates={[created('place', move, 'Aufenthalt angelegt')]} />
    </div>
  )
}

type Entry = { fact: Fact; key: string; span: [number, number]; type?: string }

function History({ id, involves }: { id: string; involves: (fact: Fact, i: number) => boolean }) {
  const { book, current, jump } = useUi()
  const entries = book.facts
    .flatMap((fact): Entry[] => (fact.kind === 'relation' ? fact.phases.map((phase) => ({ fact, key: phase.id, span: bounds(book, phase.timing), type: phase.type })) : [{ fact, key: fact.id, span: bounds(book, factTiming(book, fact)) }]))
    .filter((e) => involves(e.fact, e.span[0]))
    .sort((a, b) => a.span[0] - b.span[0])
  if (!entries.length) return null
  const active = entries.filter((e) => e.span[0] <= current).length - 1
  return (
    <Section title="Verlauf">
      <Timeline active={active} bulletSize={12} lineWidth={2}>
        {entries.map((e) => (
          <Timeline.Item key={e.key} title={<Clickable onClick={() => jump(e.span[0])} className="history-entry"><Text span size="xs" c="dimmed" style={{ flexShrink: 0 }}>{spanLabel(book, e.span)} </Text><HistoryText fact={e.fact} me={id} type={e.type} /></Clickable>} />
        ))}
      </Timeline>
    </Section>
  )
}

function HistoryText({ fact, me, type }: { fact: Fact; me: string; type?: string }) {
  const { book } = useUi()
  const other = (a: string, b: string) => <Ref id={a === me ? b : a} />
  switch (fact.kind) {
    case 'stay':
      return <Text span size="sm">{fact.person === me ? <>in <Ref id={fact.place} /></> : <Ref id={fact.person} />}</Text>
    case 'journey':
      return <Text span size="sm">unterwegs nach <Ref id={fact.destination} /></Text>
    case 'participation':
      return <Text span size="sm">{fact.actor === me ? <>bei <Ref id={fact.event} /></> : <Ref id={fact.actor} />}</Text>
    case 'membership':
      return <Text span size="sm">{fact.person === me ? <>in <Ref id={fact.group} /></> : <Ref id={fact.person} />}</Text>
    case 'relation': {
      const kind = book.relationTypes.find((t) => t.id === type)
      const arrow = !kind?.directed ? '↔' : fact.from === me ? '→' : '←'
      return <Text span size="sm">{arrow} {other(fact.from, fact.to)} {kind?.name}</Text>
    }
  }
}

function PlaceDetails({ place }: { place: Place }) {
  const { book, current, scope, change } = useUi()
  const phase = phaseAt(book, place.phases, current)
  const inPhase = (d: Book, mutate: (p: Place['phases'][number]) => void) => void changeAt(d, byId<Place>(d, place.id).phases, current, scope, mutate)
  const here = book.facts.filter((f) => f.kind === 'stay' && covers(book, f.timing, current) && placeChain(book, f.place, current).some((p) => p.id === place.id))
  const parents = [{ id: '', label: 'ohne Elternort' }, ...optionsOf(book, 'place').filter((o) => o.id !== place.id)]
  return (
    <>
      <Row label="Radius">
        <NumberField id={place.id} field="radius" value={place.radius ?? 2.1} label="Radius" min={0.5} />
      </Row>
      {phase ? (
        <Section title={`Lage auf ${current + 1} · ${when(book, phase.timing)}`}>
          {scope === 'hier' && bounds(book, phase.timing)[0] < current && (
            <Text size="xs" className="scope-note">
              Lage und Elternort ändern sich ab {current + 1}
            </Text>
          )}
          <Row label="Elternort">
            <RefPicker label="Elternort" options={parents} value={phase.parent} empty="ohne" onPick={(parent) => change('Elternort geändert', (d) => inPhase(d, (p) => setText(p, 'parent', parent)))} />
          </Row>
          {(['x', 'y'] as const).map((axis) => (
            <Row key={axis} label={axis.toUpperCase()}>
              <Inline field={`${axis}:${place.id}`} value={String(phase[axis])} label={axis.toUpperCase()} number onCommit={(v) => change('Lage geändert', (d) => inPhase(d, (p) => (p[axis] = Number(v))))} />
            </Row>
          ))}
          <Text size="xs" c="dimmed" mt={4}>
            Oder den Ring in der Szene ziehen.
          </Text>
        </Section>
      ) : (
        <Text size="sm" c="dimmed">
          Keine Lage auf {current + 1}.
        </Text>
      )}
      <Section title={`Hier auf ${current + 1}`}>
        <Group gap="xs">
          {here.length ? here.map((f) => f.kind === 'stay' && <Ref key={f.id} id={f.person} />) : <Text size="sm" c="dimmed">niemand</Text>}
        </Group>
      </Section>
      {place.phases.length > 1 && (
        <Section title="Lagen">
          {place.phases.map((p) => (
            <Text key={p.id} size="sm" c={p === phase ? undefined : 'dimmed'}>
              {when(book, p.timing)}: {p.parent ? <><Ref id={p.parent} /> </> : ''}bei {p.x} / {p.y}
            </Text>
          ))}
        </Section>
      )}
    </>
  )
}

function EventDetails({ event }: { event: StoryEvent }) {
  const { book, change } = useUi()
  const created = useCreate()
  const participants = book.facts.filter((f) => f.kind === 'participation' && f.event === event.id)
  const caused = book.facts.filter((f) => (f.kind === 'relation' ? f.phases.some((p) => p.causedBy === event.id) : f.causedBy === event.id))
  const add = (d: Book, actor: string) => void d.facts.push({ kind: 'participation', id: newId(allIds(d)), actor, event: event.id })
  return (
    <>
      <Row label="Zeit">
        <SpanField span={bounds(book, event.timing)} label="Event-Zeit" onCommit={(span) => change('Event-Zeit geändert', (d) => void (byId<StoryEvent>(d, event.id).timing = toTiming(d, span)))} />
      </Row>
      <Row label="Ort">
        <RefPicker label="Ort des Events" options={[{ id: '', label: 'ohne Ort' }, ...optionsOf(book, 'place')]} value={event.place} empty="ohne Ort" onPick={(place) => change('Ort des Events geändert', (d) => setText(byId(d, event.id), 'place', place))} creates={[created('place', (d, place) => void (byId<StoryEvent>(d, event.id).place = place), 'Ort des Events geändert')]} />
      </Row>
      <Section title="Beteiligt" action={<RefPicker label="Beteiligte hinzufügen" empty="+ Beteiligte" options={optionsOf(book, 'actor').filter((o) => !participants.some((p) => p.kind === 'participation' && p.actor === o.id))} onPick={(actor) => change('Beteiligte hinzugefügt', (d) => add(d, actor))} creates={[created('person', add, 'Beteiligte hinzugefügt')]} />}>
        <Stack gap={2}>
          {participants.map((f) => (
            <FactEditor key={f.id} fact={f} me={event.id} />
          ))}
          {!participants.length && (
            <Text size="sm" c="dimmed">
              noch niemand
            </Text>
          )}
        </Stack>
      </Section>
      <Section title="Ergebnis">
        <TextField id={event.id} field="result" value={event.result} label="Ergebnis" multiline placeholder="Was ändert sich dadurch?" />
      </Section>
      {caused.length > 0 && (
        <Section title="Folgen">
          {caused.map((f) => (
            <Text key={f.id} size="sm">
              {involvedIds(f).map((ref, k) => (
                <span key={ref}>
                  {k > 0 && ' – '}
                  <Ref id={ref} />
                </span>
              ))}
            </Text>
          ))}
        </Section>
      )}
    </>
  )
}

/** Bilder eines Elements: ablegen, einfügen oder auswählen, sortieren per Ziehen, je Bild Zeit und Notiz (Festlegung 37) */
function ImageSection({ id, name, images }: { id: string; name: string; images: Image[] }) {
  const { book, change, upload, expanded, toggle } = useUi()
  const [dragged, setDragged] = useState<string | null>(null)
  const sorted = [...images].sort((a, b) => a.order - b.order)
  const owner = findElement(book, id)?.element
  const life = owner && 'existence' in owner ? bounds(book, owner.existence) : ([0, book.timePoints.length - 1] as [number, number])
  const add = async (file: File) => {
    const path = await upload(file, name)
    change('Bild hinzugefügt', (d) => void addImage(d, id, path))
  }
  const reorder = (target: string) => {
    if (!dragged || dragged === target) return
    const ids = sorted.map((i) => i.id).filter((i) => i !== dragged)
    ids.splice(ids.indexOf(target), 0, dragged)
    change('Bilder umsortiert', (d) => ids.forEach((imageId, k) => (byId<Image>(d, imageId).order = k + 1)))
  }
  return (
    <Section title="Bilder">
      {sorted.length > 0 && (
        <Group gap="xs" mb="xs">
          {sorted.map((image) => (
            <UnstyledButton
              key={image.id}
              className={`thumb ${expanded.has(image.id) ? 'open' : ''}`}
              draggable
              onDragStart={() => setDragged(image.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => reorder(image.id)}
              onClick={() => toggle(image.id)}
              aria-label={`Bild ${image.file}`}
            >
              <BookImage file={image.file} alt={image.file} empty="fehlt" />
            </UnstyledButton>
          ))}
        </Group>
      )}
      {sorted.filter((i) => expanded.has(i.id)).map((image) => (
        <Stack key={image.id} gap="xs" className="fact-body" mb="xs">
          <Text size="xs" c="dimmed" truncate>
            {image.file}
          </Text>
          <Row label="Immer gültig">
            <Switch checked={!image.timing} aria-label="Bild gilt immer" onChange={() => change('Bildzeit geändert', (d) => {
              const target = byId<Image>(d, image.id)
              if (target.timing) delete target.timing
              else target.timing = toTiming(d, life)
            })} />
          </Row>
          {image.timing && (
            <Row label="Zeit">
              <SpanField span={bounds(book, image.timing)} label="Bildzeit" onCommit={(span) => change('Bildzeit geändert', (d) => void (byId<Image>(d, image.id).timing = toTiming(d, span)))} />
            </Row>
          )}
          <Row label="Notiz">
            <TextField id={image.id} field="note" value={image.note} label="Notiz" optional />
          </Row>
          <UnstyledButton className="link-danger" onClick={() => change('Bild entfernt', (d) => removeImage(d, image.id))}>
            Bild entfernen
          </UnstyledButton>
        </Stack>
      ))}
      <DropZone onFile={add}>
        <Text size="sm" c="dimmed" ta="center">
          Bild ablegen, einfügen (Strg+V) oder <u>auswählen</u>
        </Text>
      </DropZone>
    </Section>
  )
}
