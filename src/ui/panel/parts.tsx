import { hintKey } from '../../checks'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Anchor, Box, Button, Group, Image as Picture, Kbd, Text } from '@mantine/core'
import { byId, setText } from '../../edit/ops'
import { elementColor, findElement } from '../../model'
import { useUi } from '../context'
import { Inline, Markdown } from '../fields'

/** Abschnitt im Panel mit Überschrift und optionaler Aktion rechts */
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel-section" aria-label={title}>
      <Group justify="space-between" mb={6} wrap="nowrap">
        <Text size="xs" tt="uppercase" fw={700} c="dimmed">
          {title}
        </Text>
        {action}
      </Group>
      {children}
    </section>
  )
}

/** Zeile mit Bezeichnung links und Wert rechts */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="kv-row">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <div>{children}</div>
    </div>
  )
}

/** Klickbarer Name eines Elements in seiner Farbe */
export function Ref({ id }: { id: string }) {
  const { book, select } = useUi()
  const found = findElement(book, id)
  if (!found) return <>{id}</>
  return (
    <Anchor component="button" type="button" size="sm" fw={600} c={elementColor(book, id)} onClick={(e) => (e.stopPropagation(), select({ kind: found.kind, id }))}>
      {found.label}
    </Anchor>
  )
}

/** Klickfläche, die selbst Knöpfe enthalten darf (verschachtelte <button> sind in HTML verboten) */
export function Clickable({ onClick, className, expanded, children }: { onClick: () => void; className?: string; expanded?: boolean; children: ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={className}
      aria-expanded={expanded}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        onClick()
      }}
    >
      {children}
    </div>
  )
}

/** Textfeld, das in das Objekt mit der ID schreibt; leere optionale Texte werden entfernt */
export function TextField(props: { id: string; field: string; value?: string; label: string; placeholder?: string; multiline?: boolean; optional?: boolean; dimmed?: boolean }) {
  const { change } = useUi()
  const { id, field, value = '', label, multiline, optional } = props
  return (
    <Inline
      field={`${field}:${id}`}
      value={value}
      label={label}
      multiline={multiline}
      placeholder={props.placeholder ?? `${label} hinzufügen …`}
      className={props.dimmed ? 'dimmed' : undefined}
      display={multiline ? <Markdown dimmed={props.dimmed}>{value}</Markdown> : undefined}
      onCommit={(v) => change(`${label} geändert`, (d) => (optional ? setText(byId(d, id), field, v) : void ((byId<Record<string, unknown>>(d, id)[field] = v))))}
    />
  )
}

/** Zahlenfeld, das in das Objekt mit der ID schreibt */
export function NumberField({ id, field, value, label, min }: { id: string; field: string; value: number; label: string; min?: number }) {
  const { change } = useUi()
  return <Inline field={`${field}:${id}`} value={String(value)} label={label} number onCommit={(v) => change(`${label} geändert`, (d) => void (byId<Record<string, number>>(d, id)[field] = Math.max(min ?? -Infinity, Number(v))))} />
}

/** Bild aus Arbeitskopie oder Beispiel; zeigt beim Laden und ohne Bild einen Platzhalter */
export function BookImage({ file, alt, empty = 'Kein Bild zu diesem Zeitpunkt' }: { file?: string; alt: string; empty?: string }) {
  const { imageUrl } = useUi()
  const [loaded, setLoaded] = useState<{ file: string; url?: string }>()
  useEffect(() => {
    if (file) imageUrl(file).then((url) => setLoaded({ file, url }))
  }, [file, imageUrl])
  const url = loaded?.file === file ? loaded?.url : undefined
  return url ? (
    <Picture src={url} radius="sm" alt={alt} mah={200} fit="cover" />
  ) : (
    <Box className="image-placeholder">
      <Text size="xs" c="dimmed">
        {file && loaded?.file !== file ? 'Bild wird geladen …' : empty}
      </Text>
    </Box>
  )
}

/** Fläche zum Ablegen oder Auswählen einer Bilddatei */
export function DropZone({ onFile, children }: { onFile: (file: File) => void; children: ReactNode }) {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  return (
    <div
      className={`dropzone ${over ? 'over' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))
        if (file) onFile(file)
      }}
    >
      {children}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        data-testid="image-input"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0]
          if (file) onFile(file)
          e.currentTarget.value = ''
        }}
      />
    </div>
  )
}

/** Löschen-Knopf am Ende eines Panels */
export function DeleteButton({ id }: { id: string }) {
  const { remove } = useUi()
  return (
    <Group className="panel-footer">
      <Button variant="subtle" color="red" size="xs" onClick={() => remove(id)} rightSection={<Kbd size="xs">Entf</Kbd>}>
        Löschen
      </Button>
    </Group>
  )
}

/** Hinweise zu einem Element; ein Klick öffnet den Dialog zum Auflösen */
export function HintRows({ id }: { id: string }) {
  const { hints, openHint } = useUi()
  const own = hints.filter((h) => h.els.includes(id))
  if (!own.length) return null
  return (
    <Section title="Hinweise">
      {own.map((hint) => (
        <button key={hintKey(hint)} type="button" className="hint-row" onClick={() => openHint(hintKey(hint))}>
          <span className="at">{hint.at + 1}</span>
          <span>{hint.text}</span>
          <span className="go">Lösen ›</span>
        </button>
      ))}
    </Section>
  )
}

/** Notiz eines Objekts */
export function NoteSection({ id, note }: { id: string; note?: string }) {
  return (
    <Section title="Notiz">
      <TextField id={id} field="note" value={note} label="Notiz" multiline optional />
    </Section>
  )
}
