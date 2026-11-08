import { useState } from 'react'
import { Anchor, Badge, Button, Group, Modal, Stack, Switch, Text, UnstyledButton } from '@mantine/core'
import { hintKey, hints as allHints } from '../../checks'
import { allIds, byId, moveTimePoint, setText } from '../../edit/ops'
import { backgroundSize } from '../../edit/backgroundSize'
import { removeImage } from '../../edit/fixes'
import type { Book, RelationType, TimePoint } from '../../model'
import { filesToBook, newId } from '../../storage/format'
import { sampleFiles } from '../../storage/sample'
import { useUi } from '../context'
import { Inline } from '../fields'
import { PanelHeader } from './ElementPanel'
import { BookImage, DateField, DeleteButton, DropZone, HintRows, NoteSection, NumberField, Row, Section, TextField } from './parts'

function scaleBackground(target: TimePoint, width: number) {
  const background = target.background!
  const next = Math.max(1, width)
  background.height = Math.round(((background.height ?? background.width) * next * 10) / background.width) / 10
  background.width = next
}

/** Editor eines Zeitpunkts: Name, Datum, Reihenfolge, Hintergrund (Festlegung 38) */
export function TimePointPanel({ point }: { point: TimePoint }) {
  const { book, points, change, upload, jump } = useUi()
  const k = points.findIndex((t) => t.id === point.id)
  const move = (to: number) => change(`${point.name} verschoben`, (d) => moveTimePoint(d, k, to)) && jump(to)
  const background = point.background
  const setBackground = async (file: File) => {
    const [path, size] = await Promise.all([upload(file, point.name), backgroundSize(file)])
    change('Hintergrund gesetzt', (d) => {
      const target = byId<TimePoint>(d, point.id)
      target.background = target.background ? { ...target.background, file: path, ...size } : { id: newId(allIds(d)), file: path, x: 0, y: 0, ...size }
    })
  }
  return (
    <Stack gap="md">
      <PanelHeader id={point.id} name={point.name} badge={`Zeitpunkt ${k + 1}`} />
      <Row label="Bezeichnung">
        <TextField id={point.id} field="dateLabel" value={point.dateLabel} label="Bezeichnung" placeholder="z. B. Frühling" optional />
      </Row>
      <Row label="Datum">
        <DateField id={point.id} label="Datum" />
      </Row>
      <Row label="Reihenfolge">
        <Group gap="xs">
          <Button size="xs" variant="default" disabled={k === 0} onClick={() => move(k - 1)}>
            ‹ früher
          </Button>
          <Text size="sm" c="dimmed">
            {k + 1} von {points.length}
          </Text>
          <Button size="xs" variant="default" disabled={k === points.length - 1} onClick={() => move(k + 1)}>
            später ›
          </Button>
        </Group>
      </Row>
      <HintRows id={point.id} />
      <Section title="Hintergrund" action={background && <Anchor component="button" type="button" size="xs" c="red" onClick={() => change('Hintergrund entfernt', (d) => removeImage(d, background.id))}>entfernen</Anchor>}>
        {background ? (
          <Stack gap="xs">
            <BookImage file={background.file} alt={point.name} />
            {(['x', 'y'] as const).map((field) => (
              <Row key={field} label={field.toUpperCase()}>
                <NumberField id={background.id} field={field} value={background[field]} label={field.toUpperCase()} />
              </Row>
            ))}
            <Row label="Breite">
              <Inline field={`width:${background.id}`} value={String(background.width)} label="Breite" number onCommit={(v) => change('Breite geändert', (d) => scaleBackground(byId<TimePoint>(d, point.id), Number(v)))} />
            </Row>
            <DropZone onFile={setBackground}>
              <Text size="xs" c="dimmed" ta="center">
                Anderes Bild ablegen oder auswählen
              </Text>
            </DropZone>
          </Stack>
        ) : (
          <DropZone onFile={setBackground}>
            <Text size="sm" c="dimmed" ta="center">
              Karte oder Bild ablegen oder <u>auswählen</u>
              <br />
              gilt bis zum nächsten Zeitpunkt mit eigenem Hintergrund
            </Text>
          </DropZone>
        )}
      </Section>
      <NoteSection id={point.id} note={point.note} />
      {book.timePoints.length > 1 && <DeleteButton id={point.id} />}
    </Stack>
  )
}

/** Editor einer Beziehungsart */
export function RelationTypePanel({ type }: { type: RelationType }) {
  const { change } = useUi()
  return (
    <Stack gap="md">
      <PanelHeader id={type.id} name={type.name} color={type.color} badge="Beziehungsart" />
      <Row label="Kategorie">
        <TextField id={type.id} field="category" value={type.category} label="Kategorie" placeholder="z. B. Nähe" />
      </Row>
      <Row label="Gerichtet">
        <Switch checked={type.directed} aria-label="Gerichtet" onChange={() => change('Richtung der Art geändert', (d) => void (byId<RelationType>(d, type.id).directed = !type.directed))} />
      </Row>
      {type.directed && (
        <Row label="Gegenrichtung">
          <TextField id={type.id} field="inverseName" value={type.inverseName} label="Name der Gegenrichtung" placeholder="z. B. wird geliebt von" optional />
        </Row>
      )}
      <NoteSection id={type.id} note={type.note} />
      <DeleteButton id={type.id} />
    </Stack>
  )
}

/** Editor des Buchs: Titel, Notiz, Zeitpunkte sortieren, Beziehungsarten, gewollte Hinweise (Festlegung 36) */
export function BookPanel() {
  const { book, points, sample, change, select } = useUi()
  const [dragged, setDragged] = useState<number | null>(null)
  const [resetting, setResetting] = useState(false)
  const texts = new Map(allHints(book).map((h) => [hintKey(h), h.text]))
  return (
    <Stack gap="md">
      <Group gap="xs" wrap="nowrap" pr={28}>
        <Inline field="title" value={book.title} label="Titel" className="panel-name" onCommit={(v) => v && change('Titel geändert', (d) => void (d.title = v))} />
        <Badge variant="light" color="gray">
          Buch
        </Badge>
      </Group>
      <Inline field="booknote" value={book.note ?? ''} label="Notiz zum Buch" multiline placeholder="Notiz zum Buch …" className="dimmed" onCommit={(v) => change('Notiz geändert', (d) => setText(d, 'note', v))} />
      <Section title="Zeitpunkte">
        <Stack gap={2}>
          {points.map((t, k) => (
            <div
              key={t.id}
              className={`tp-row ${dragged !== null && dragged !== k ? 'drop-target' : ''}`}
              draggable
              onDragStart={() => setDragged(k)}
              onDragEnd={() => setDragged(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragged !== null && dragged !== k) change(`${points[dragged]!.name} verschoben`, (d) => moveTimePoint(d, dragged, k))
                setDragged(null)
              }}
            >
              <span className="grip" aria-hidden>
                ⋮⋮
              </span>
              <Text size="sm" c="dimmed" w={20}>
                {k + 1}
              </Text>
              <Anchor component="button" type="button" size="sm" onClick={() => select({ kind: 'timePoint', id: t.id })}>
                {t.name}
              </Anchor>
              <Text size="xs" c="dimmed" ml="auto">
                {t.dateLabel}
              </Text>
            </div>
          ))}
        </Stack>
        <Text size="xs" c="dimmed" mt={4}>
          Zum Umsortieren ziehen. Liefe eine Zeitangabe dadurch rückwärts, wird es verhindert.
        </Text>
      </Section>
      <Section title="Beziehungsarten">
        <Group gap="xs">
          {book.relationTypes.map((t) => (
            <UnstyledButton key={t.id} className="chip" onClick={() => select({ kind: 'relationType', id: t.id })}>
              <span className="dot" style={{ background: t.color }} /> {t.name}
            </UnstyledButton>
          ))}
        </Group>
      </Section>
      {book.acceptedHints.length > 0 && (
        <Section title="Als gewollt markiert">
          <Stack gap="xs">
            {book.acceptedHints.map((a) => (
              <Group key={hintKey(a)} gap="xs" wrap="nowrap" align="flex-start">
                <div style={{ flex: 1 }}>
                  <Text size="sm">{texts.get(hintKey(a)) ?? 'Hinweis besteht nicht mehr'}</Text>
                  {a.note && (
                    <Text size="xs" c="dimmed" fs="italic">
                      {a.note}
                    </Text>
                  )}
                </div>
                <Anchor component="button" type="button" size="xs" onClick={() => change('Hinweis wieder angezeigt', (d) => void (d.acceptedHints = d.acceptedHints.filter((x) => hintKey(x) !== hintKey(a))))}>
                  Wieder anzeigen
                </Anchor>
              </Group>
            ))}
          </Stack>
        </Section>
      )}
      {sample && (
        <Group className="panel-footer">
          <Button size="xs" variant="subtle" color="red" onClick={() => setResetting(true)}>
            Beispielbuch zurücksetzen
          </Button>
        </Group>
      )}
      <Modal opened={resetting} onClose={() => setResetting(false)} title="Beispielbuch zurücksetzen?" centered>
        <Text size="sm" c="dimmed">
          Alle Änderungen am Beispielbuch gehen verloren. Rückgängig ist bis zum Neuladen möglich.
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setResetting(false)}>
            Abbrechen
          </Button>
          <Button color="red" data-autofocus onClick={() => (setResetting(false), change('Beispielbuch zurückgesetzt', (d) => void Object.assign(d, original())))}>
            Zurücksetzen
          </Button>
        </Group>
      </Modal>
    </Stack>
  )
}

const original = (): Book => filesToBook(sampleFiles).book
