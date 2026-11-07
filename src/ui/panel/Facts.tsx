import { useState, type ReactNode } from 'react'
import { Anchor, Badge, Button, Group, Stack, Switch, Text, UnstyledButton } from '@mantine/core'
import { allIds, byId, changeAt, connect, create, moveStay, removeFact, setText, toTiming, type Span } from '../../edit/ops'
import { newId } from '../../storage/format'
import { bounds, covers, factTiming, phaseAt, timeline, type Book, type Fact, type Relation, type RelationPhase, type Timing } from '../../model'
import { useUi } from '../context'
import { Picker, RefPicker, SpanField, type Option } from '../fields'
import { Clickable, Ref, Row, TextField } from './parts'
import { optionsOf, useCreate, when } from './lookup'

type Draft = Record<string, unknown>

/** Aufklappbare Zeile eines Fakts: kurz beim Lesen, alle Felder nach einem Klick (Festlegung 35) */
function FactRow({ id, summary, timing, children }: { id: string; summary: ReactNode; timing: Timing; children: ReactNode }) {
  const { book, expanded, toggle } = useUi()
  const open = expanded.has(id)
  return (
    <div className={`fact ${open ? 'open' : ''}`} data-fact={id}>
      <Clickable className="fact-summary" onClick={() => toggle(id)} expanded={open}>
        <span className="chevron" aria-hidden />
        <span className="fact-text">{summary}</span>
        <Text span size="xs" c="dimmed" ml="auto">
          {when(book, timing)}
        </Text>
      </Clickable>
      {open && <Stack className="fact-body" gap="xs">{children}</Stack>}
    </div>
  )
}

/** Hinweis, dass zeitliche Werte ab dem aktuellen Zeitpunkt geändert werden (Festlegung 16) */
function ScopeNote({ timing }: { timing: Timing }) {
  const { book, current, scope } = useUi()
  if (scope !== 'hier' || bounds(book, timing)[0] >= current) return null
  return (
    <Text size="xs" className="scope-note">
      Ort, Art und Stärke ändern sich ab {current + 1}, davor bleibt es, wie es war
    </Text>
  )
}

function TimeRow({ id, timing }: { id: string; timing: Timing }) {
  const { book, change } = useUi()
  return (
    <Row label="Zeit">
      <SpanField span={bounds(book, timing)} label="Zeit" onCommit={(span) => change('Zeit geändert', (d) => void (byId<Draft>(d, id).timing = toTiming(d, span)))} />
    </Row>
  )
}

function CauseRow({ id, value }: { id: string; value?: string }) {
  const { book, change } = useUi()
  const options: Option[] = [{ id: '', label: 'ohne Auslöser' }, ...optionsOf(book, 'event')]
  return (
    <Row label="Ausgelöst durch">
      <RefPicker label="Auslösendes Event" options={options} value={value} empty="ohne" onPick={(event) => change('Auslöser geändert', (d) => setText(byId(d, id), 'causedBy', event))} />
    </Row>
  )
}

function Common({ id, note, cause, remove }: { id: string; note?: string; cause?: string; remove: string }) {
  const { change } = useUi()
  return (
    <>
      <CauseRow id={id} value={cause} />
      <Row label="Notiz">
        <TextField id={id} field="note" value={note} label="Notiz" optional />
      </Row>
      <Group>
        <Button size="xs" variant="subtle" color="red" onClick={() => change(`${remove} entfernt`, (d) => removeFact(d, id))}>
          {remove} entfernen
        </Button>
      </Group>
    </>
  )
}

/** Zeile eines Fakts mit allen Feldern; bei Beziehungen die Phase zum aktuellen Zeitpunkt */
export function FactEditor({ fact, me }: { fact: Fact; me: string }) {
  const { book, current } = useUi()
  switch (fact.kind) {
    case 'stay':
      return <StayRow fact={fact} />
    case 'journey':
      return (
        <FactRow id={fact.id} timing={fact.timing} summary={<>unterwegs <Ref id={fact.origin} /> → <Ref id={fact.destination} /></>}>
          <PlaceField label="Von" id={fact.id} field="origin" value={fact.origin} />
          <PlaceField label="Nach" id={fact.id} field="destination" value={fact.destination} />
          <TimeRow id={fact.id} timing={fact.timing} />
          <Common id={fact.id} note={fact.note} cause={fact.causedBy} remove="Reise" />
        </FactRow>
      )
    case 'membership':
      return (
        <FactRow id={fact.id} timing={fact.timing} summary={<>{me === fact.person ? <>in <Ref id={fact.group} /></> : <Ref id={fact.person} />}{fact.role && ` (${fact.role})`}</>}>
          <Row label="Rolle">
            <TextField id={fact.id} field="role" value={fact.role} label="Rolle" optional />
          </Row>
          <TimeRow id={fact.id} timing={fact.timing} />
          <Common id={fact.id} note={fact.note} cause={fact.causedBy} remove="Mitgliedschaft" />
        </FactRow>
      )
    case 'participation':
      return <ParticipationRow fact={fact} me={me} />
    case 'relation': {
      const phase = phaseAt(book, fact.phases, current)
      return phase ? <RelationRow relation={fact} phase={phase} me={me} /> : null
    }
  }
}

function PlaceField({ label, id, field, value }: { label: string; id: string; field: string; value: string }) {
  const { book, change } = useUi()
  const created = useCreate()
  const set = (d: Book, place: string) => void (byId<Draft>(d, id)[field] = place)
  return (
    <Row label={label}>
      <RefPicker label={label} options={optionsOf(book, 'place')} value={value} onPick={(place) => change(`${label} geändert`, (d) => set(d, place))} creates={[created('place', set, `${label} geändert`)]} />
    </Row>
  )
}

function StayRow({ fact }: { fact: Extract<Fact, { kind: 'stay' }> }) {
  const { book, current, scope, change } = useUi()
  const created = useCreate()
  const move = (d: Book, place: string) => {
    const own = d.facts.filter((f) => f.kind === 'stay' && f.person === fact.person) as (typeof fact)[]
    changeAt(d, own, current, scope, (s) => (s.place = place), d.facts as (typeof fact)[])
  }
  return (
    <FactRow id={fact.id} timing={fact.timing} summary={<>in <Ref id={fact.place} /></>}>
      <ScopeNote timing={fact.timing} />
      <Row label="Ort">
        <RefPicker label="Ort" options={optionsOf(book, 'place')} value={fact.place} onPick={(place) => change('Aufenthalt geändert', (d) => move(d, place))} creates={[created('place', move, 'Aufenthalt geändert')]} />
      </Row>
      <TimeRow id={fact.id} timing={fact.timing} />
      <Common id={fact.id} note={fact.note} cause={fact.causedBy} remove="Aufenthalt" />
    </FactRow>
  )
}

function ParticipationRow({ fact, me }: { fact: Extract<Fact, { kind: 'participation' }>; me: string }) {
  const { book, change } = useUi()
  const own = !!fact.timing
  return (
    <FactRow id={fact.id} timing={factTiming(book, fact)} summary={<>{me === fact.actor ? <>bei <Ref id={fact.event} /></> : <Ref id={fact.actor} />}{fact.role && ` (${fact.role})`}</>}>
      <Row label="Rolle">
        <TextField id={fact.id} field="role" value={fact.role} label="Rolle" optional />
      </Row>
      <Row label="Eigene Zeit">
        <Switch
          checked={own}
          aria-label="Eigene Zeit statt Event-Zeit"
          onChange={() => change(own ? 'Event-Zeit gilt' : 'Eigene Zeit', (d) => {
            const part = byId<Draft>(d, fact.id)
            if (own) delete part.timing
            else part.timing = factTiming(d, fact)
          })}
        />
      </Row>
      {fact.timing && <TimeRow id={fact.id} timing={fact.timing} />}
      <Common id={fact.id} note={fact.note} cause={fact.causedBy} remove="Teilnahme" />
    </FactRow>
  )
}

function RelationRow({ relation, phase, me }: { relation: Relation; phase: RelationPhase; me: string }) {
  const { book, current, scope, change } = useUi()
  const type = book.relationTypes.find((t) => t.id === phase.type)
  const other = relation.from === me ? relation.to : relation.from
  const arrow = !type?.directed ? '↔' : relation.from === me ? '→' : '←'
  const inPhase = (d: Book, mutate: (p: RelationPhase) => void) => {
    const rel = byId<Relation>(d, relation.id)
    changeAt(d, rel.phases, current, scope, mutate)
  }
  return (
    <FactRow
      id={phase.id}
      timing={phase.timing}
      summary={
        <>
          {arrow} <Ref id={other} />{' '}
          {type && (
            <Badge size="xs" variant="outline" color={type.color}>
              {type.name} · {phase.strength}
            </Badge>
          )}
        </>
      }
    >
      <ScopeNote timing={phase.timing} />
      <Row label="Art">
        <RefPicker label="Beziehungsart" options={optionsOf(book, 'relationType')} value={phase.type} onPick={(t) => change('Beziehungsart geändert', (d) => inPhase(d, (p) => (p.type = t)))} />
      </Row>
      <Row label="Stärke">
        <Group gap={6} className="strength" style={{ color: type?.color }}>
          {([1, 2, 3, 4, 5] as const).map((k) => (
            <UnstyledButton key={k} className={k <= phase.strength ? 'on' : ''} aria-label={`Stärke ${k}`} aria-pressed={k === phase.strength} onClick={() => change('Stärke geändert', (d) => inPhase(d, (p) => (p.strength = k)))} />
          ))}
        </Group>
      </Row>
      <TimeRow id={phase.id} timing={phase.timing} />
      {type?.directed && (
        <Row label="Richtung">
          <Button size="xs" variant="default" onClick={() => change('Richtung umgekehrt', (d) => {
            const rel = byId<Relation>(d, relation.id)
            ;[rel.from, rel.to] = [rel.to, rel.from]
          })}>
            ⇄ umkehren
          </Button>
        </Row>
      )}
      <Common id={phase.id} note={phase.note} cause={phase.causedBy} remove="Phase" />
      {relation.phases.length > 1 && (
        <Text size="xs" c="dimmed">
          {relation.phases.length} Phasen insgesamt, siehe Verlauf
        </Text>
      )}
    </FactRow>
  )
}

type Stage = 'kind' | 'stay' | 'journey' | 'relation' | 'type' | 'membership' | 'participation'

const STAGES: { id: Stage; label: string; hint: string; person?: boolean }[] = [
  { id: 'stay', label: 'Aufenthalt', hint: 'Ort', person: true },
  { id: 'journey', label: 'Reise', hint: 'Ziel', person: true },
  { id: 'relation', label: 'Beziehung', hint: 'Person oder Gruppe' },
  { id: 'membership', label: 'Mitgliedschaft', hint: 'Gruppe', person: true },
  { id: 'participation', label: 'Teilnahme', hint: 'Event' },
]

/** „+ Verknüpfung“: erst die Art, dann das Ziel, bei Beziehungen noch die Beziehungsart */
export function AddLink({ me, person }: { me: string; person: boolean }) {
  const { book, current, scope, change } = useUi()
  const created = useCreate()
  const [stage, setStage] = useState<Stage | null>(null)
  const [other, setOther] = useState('')
  const name = (id: string) => [...book.persons, ...book.groups].find((e) => e.id === id)?.name ?? ''
  const last = timeline(book).length - 1
  const link: Record<Exclude<Stage, 'kind' | 'type'>, (d: Book, id: string) => void> = {
    stay: (d, place) => void moveStay(d, me, place, current, scope),
    journey: (d, destination) => {
      const origin = d.facts.find((f) => f.kind === 'stay' && f.person === me && covers(d, f.timing, current))
      d.facts.push({ kind: 'journey', id: newId(allIds(d)), person: me, origin: origin?.kind === 'stay' ? origin.place : destination, destination, timing: toTiming(d, [current, current]) })
    },
    relation: () => undefined,
    membership: (d, group) => void d.facts.push({ kind: 'membership', id: newId(allIds(d)), person: me, group, timing: toTiming(d, [current, last] as Span) }),
    participation: (d, event) => void d.facts.push({ kind: 'participation', id: newId(allIds(d)), actor: me, event }),
  }
  const KINDS = { stay: 'place', journey: 'place', relation: 'actor', membership: 'group', participation: 'event' } as const
  const close = () => setStage(null)
  const picker = (() => {
    if (stage === 'kind' || stage === null)
      return { title: `Neue Verknüpfung ab ${current + 1}`, options: STAGES.filter((s) => person || !s.person).map((s) => ({ id: s.id, label: s.label, hint: s.hint })), creates: [], onPick: (id: string) => setStage(id as Stage) }
    if (stage === 'type')
      return {
        title: `${name(me)} → ${name(other)}`,
        options: book.relationTypes.map((t) => ({ id: t.id, label: t.name, color: t.color, hint: `${name(me)} ${t.directed ? '→' : '↔'} ${name(other)}` })),
        creates: [created('relationType', (d, t) => connect(d, me, other, t, current, scope), 'Beziehung angelegt')],
        onPick: (t: string) => change('Beziehung angelegt', (d) => connect(d, me, other, t, current, scope)),
      }
    const kind = KINDS[stage]
    const options = optionsOf(book, kind).filter((o) => o.id !== me)
    if (stage === 'relation')
      return { title: 'Beziehung zu …', options, creates: [{ label: (q: string) => `„${q}“ als Person anlegen`, run: (q: string) => {
            let id = ''
            if (change('Person angelegt', (d) => void (id = create(d, 'person', current, q)))) {
              setOther(id)
              setStage('type')
            }
          } }], onPick: (id: string) => (setOther(id), setStage('type')) }
    const label = STAGES.find((s) => s.id === stage)!.label
    return { title: `${label} …`, options, creates: [created(kind === 'actor' ? 'person' : kind, link[stage], `${label} angelegt`)], onPick: (id: string) => change(`${label} angelegt`, (d) => link[stage](d, id)) }
  })()
  return (
    <Picker
      {...picker}
      opened={stage !== null}
      onClose={close}
      target={
        <Anchor component="button" type="button" size="xs" fw={600} onClick={() => setStage((s) => (s ? null : 'kind'))}>
          + Verknüpfung
        </Anchor>
      }
    />
  )
}
