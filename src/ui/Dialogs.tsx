import { useState } from 'react'
import { Anchor, Badge, Button, CloseButton, Group, Kbd, Modal, Paper, Stack, Text, TextInput, UnstyledButton } from '@mantine/core'
import type { Hint } from '../checks'
import { fixesFor, type Fix } from '../edit/fixes'
import { findElement } from '../model'
import { useUi } from './context'

/** Kurze Meldung oben in der Mitte, optional mit Rückgängig */
export interface Toast {
  id: number
  text: string
  error?: boolean
  undo?: boolean
}

/** Stapel der Meldungen */
export function Toasts({ items, onUndo }: { items: Toast[]; onUndo: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <Paper key={t.id} className={`toast ${t.error ? 'error' : ''}`} withBorder shadow="lg" px="md" py={6} radius="md">
          <Group gap="md" wrap="nowrap">
            <Text size="sm">{t.text}</Text>
            {t.undo && (
              <Anchor component="button" type="button" size="sm" onClick={() => onUndo(t.id)}>
                Rückgängig
              </Anchor>
            )}
          </Group>
        </Paper>
      ))}
    </div>
  )
}

/** Rückfrage vor dem Löschen, wenn andere Daten mitgehen (Festlegung 5) */
export function DeleteDialog({ name, items, onConfirm, onClose }: { name: string; items: string[]; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal opened onClose={onClose} title={`${name} löschen?`} centered>
      <Text size="sm" c="dimmed">
        Damit ändert sich auch:
      </Text>
      <ul className="delete-list">
        {items.map((item, k) => (
          <li key={k}>{item}</li>
        ))}
      </ul>
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose} rightSection={<Kbd size="xs">Esc</Kbd>}>
          Abbrechen
        </Button>
        <Button color="red" onClick={onConfirm} data-autofocus>
          Löschen
        </Button>
      </Group>
    </Modal>
  )
}

interface HintDialogProps {
  index: number
  accepting: boolean
  onAccepting: (accepting: boolean) => void
  onIndex: (index: number) => void
  onClose: () => void
  onFix: (hint: Hint, fix: Fix) => void
  onAccept: (hint: Hint, note: string) => void
  onSelf: (hint: Hint) => void
}

/** Schwebender Dialog zum Auflösen der Hinweise, einer nach dem anderen (Festlegungen 39–46) */
export function HintDialog(props: HintDialogProps) {
  const { book, hints, points, select } = useUi()
  const { index, onClose } = props
  const hint = hints[index]
  if (!hint)
    return (
      <Paper className="overlay hint-dialog" p="md" radius="md" withBorder shadow="lg" role="dialog" aria-label="Hinweise">
        <Stack align="center" gap="xs">
          {hints.length ? (
            <>
              <Text size="sm">Ende erreicht, {hints.length} Hinweise übersprungen</Text>
              <Group>
                <Button variant="default" onClick={onClose}>
                  Schließen
                </Button>
                <Button onClick={() => props.onIndex(0)}>Von vorn</Button>
              </Group>
            </>
          ) : (
            <>
              <Text size="xl" c="green">
                ✓
              </Text>
              <Text size="sm">Alle Hinweise erledigt</Text>
              <Button variant="default" onClick={onClose} rightSection={<Kbd size="xs">Esc</Kbd>}>
                Schließen
              </Button>
            </>
          )}
        </Stack>
      </Paper>
    )

  const { fixes, rows, bad } = fixesFor(book, hint)
  const n = points.length
  const at = (k: number) => `${(k / n) * 100}%`
  const width = ([a, z]: [number, number]) => `${((z - a + 1) / n) * 100}%`
  return (
    <Paper className="overlay hint-dialog" p="md" radius="md" withBorder shadow="lg" role="dialog" aria-label="Hinweis auflösen">
      <Group justify="space-between" mb="xs">
        <Badge color="yellow" variant="light">
          Hinweis {index + 1} von {hints.length}
        </Badge>
        <CloseButton onClick={onClose} aria-label="Schließen" />
      </Group>
      <Text fw={600} size="sm">
        {hint.text}
      </Text>
      <Group gap="sm" mt={4} mb="sm">
        {hint.els.map((id) => {
          const found = findElement(book, id)
          return found ? (
            <Anchor key={id} component="button" type="button" size="sm" fw={600} c={found.element.color} onClick={() => select({ kind: found.kind, id })}>
              {found.label}
            </Anchor>
          ) : null
        })}
      </Group>
      {rows.length > 0 && (
        <div className="mini-timeline" style={{ ['--n' as string]: n }}>
          {rows.map((row, k) => (
            <div className="mini-row" key={k}>
              <Text size="xs" c="dimmed" truncate title={row.label}>
                {row.label}
              </Text>
              <div className="mini-track">
                <div className="mini-bar" style={{ left: at(row.span[0]), width: width(row.span), background: row.color }} />
                {bad && bad[0] <= bad[1] && <div className="mini-bad" style={{ left: at(bad[0]), width: width(bad) }} />}
              </div>
            </div>
          ))}
          <div className="mini-row">
            <span />
            <div className="mini-numbers">
              {points.map((_, k) => (
                <span key={k} className={k === hint.at ? 'now' : ''}>
                  {k + 1}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      <Stack gap={6}>
        {fixes.map((fix, k) => (
          <UnstyledButton key={fix.label} className="fix-card" onClick={() => props.onFix(hint, fix)}>
            <Kbd size="xs">{k + 1}</Kbd>
            <div>
              <Text size="sm" fw={600}>
                {fix.label}
              </Text>
              <Text size="xs" c="dimmed">
                → {fix.preview}
              </Text>
            </div>
          </UnstyledButton>
        ))}
      </Stack>
      {props.accepting && <AcceptNote onAccept={(note) => props.onAccept(hint, note)} onCancel={() => props.onAccepting(false)} />}
      <Group gap="sm" mt="sm" wrap="nowrap" className="hint-footer">
        <Anchor component="button" type="button" size="sm" onClick={() => props.onSelf(hint)}>
          Selbst bearbeiten
        </Anchor>
        <Anchor component="button" type="button" size="sm" onClick={() => props.onAccepting(true)}>
          Als gewollt markieren <Kbd size="xs">G</Kbd>
        </Anchor>
        <Button ml="auto" size="xs" variant="default" onClick={() => props.onIndex(index + 1)} style={{ flexShrink: 0 }}>
          Überspringen <Kbd size="xs" ml={6}>S</Kbd>
        </Button>
      </Group>
    </Paper>
  )
}

function AcceptNote({ onAccept, onCancel }: { onAccept: (note: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState('')
  return (
    <Group mt="sm" gap="xs" wrap="nowrap">
      <TextInput
        flex={1}
        size="xs"
        autoFocus
        aria-label="Begründung"
        placeholder="Begründung (optional), Enter markiert"
        value={note}
        onChange={(e) => setNote(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onAccept(note.trim())
          if (e.key === 'Escape') {
            e.stopPropagation()
            onCancel()
          }
        }}
      />
      <Button size="xs" onClick={() => onAccept(note.trim())}>
        Markieren
      </Button>
    </Group>
  )
}
