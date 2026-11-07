import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ColorSwatch, Group, Kbd, Popover, RangeSlider, SimpleGrid, Stack, Text, TextInput, Textarea, Tooltip, Typography, UnstyledButton } from '@mantine/core'
import ReactMarkdown from 'react-markdown'
import { PALETTE, type Span } from '../edit/ops'
import { formatDate, untilNextEra } from '../calendar'
import { spanLabel, type BookDate, type Calendar } from '../model'
import { useUi } from './context'

/** Markdown ohne rohes HTML; Links öffnen in einem neuen Tab */
export function Markdown({ children, dimmed }: { children: string; dimmed?: boolean }) {
  // react-markdown erzeugt React-Elemente und lässt rohes HTML weg, Texte von Mitautoren können keinen Code einschleusen
  return (
    <Typography className="markdown" c={dimmed ? 'dimmed' : undefined} fz="sm">
      <ReactMarkdown components={{ a: ({ href, children: label }) => <a href={href} target="_blank" rel="noreferrer">{label}</a> }}>{children}</ReactMarkdown>
    </Typography>
  )
}

const FOCUSABLE = 'button:not([disabled]), [data-field], input:not([type=hidden]):not([disabled]), textarea, [role=slider], [tabindex="0"]'

// Tab übernimmt und geht zum nächsten Bedienelement derselben Fläche; ein Textfeld öffnet sich dabei gleich
function openNext(field: string, back: boolean) {
  const current = [...document.querySelectorAll<HTMLElement>('[data-field]')].find((el) => el.dataset.field === field)
  if (!current) return
  const area = current.closest('[role=complementary], [role=dialog], .overlay') ?? document.body
  const all = [...area.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest('[hidden], [aria-hidden=true], [style*="display: none"]'))
  const next = all[all.indexOf(current) + (back ? -1 : 1)]
  if (next?.dataset.field) next.click()
  else (next ?? current).focus()
}

interface InlineProps {
  field: string
  value: string
  label: string
  onCommit: (value: string) => void
  placeholder?: string
  multiline?: boolean
  number?: boolean
  /** Darstellung außerhalb der Bearbeitung, sonst der Text selbst */
  display?: ReactNode
  className?: string
}

/** Text, der beim Klick editierbar wird: Enter oder Verlassen übernimmt, Esc verwirft, Tab geht weiter (Festlegung 9) */
export function Inline({ field, value, label, onCommit, placeholder = 'leer', multiline, number, display, className }: InlineProps) {
  const { editRequest, requestEdit } = useUi()
  const [own, setDraft] = useState<string | null>(null)
  const done = useRef(false)
  // Nach dem Anlegen oder F2 geht das Feld ohne Klick in Bearbeitung, mit markiertem Text
  const requested = editRequest === field && own === null
  const draft = own ?? (requested ? value : null)

  const finish = (save: boolean, tab?: boolean, back = false) => {
    if (done.current || draft === null) return
    done.current = true
    setDraft(null)
    if (requested || editRequest === field) requestEdit(null)
    const text = number ? draft.replace(',', '.').trim() : multiline ? draft.replace(/\s+$/, '') : draft.trim()
    const valid = !number || (text !== '' && Number.isFinite(Number(text)))
    if (save && valid && text !== value) onCommit(text)
    if (tab) setTimeout(() => openNext(field, back))
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      finish(false)
    } else if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      finish(true)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      finish(true, true, e.shiftKey)
    }
  }

  if (draft !== null) {
    const common = {
      value: draft,
      'aria-label': label,
      placeholder,
      autoFocus: true,
      onChange: (e: { currentTarget: { value: string } }) => setDraft(e.currentTarget.value),
      onBlur: () => finish(true),
      onKeyDown,
      onFocus: (e: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
        done.current = false
        const length = e.currentTarget.value.length
        e.currentTarget.setSelectionRange(requested ? 0 : length, length)
      },
      className: `field-input ${className ?? ''}`,
    }
    return multiline ? (
      <div>
        <Textarea {...common} autosize minRows={3} />
        <Text size="xs" c="dimmed" mt={4}>
          Markdown · <Kbd size="xs">Strg Enter</Kbd> übernehmen · <Kbd size="xs">Esc</Kbd> verwerfen
        </Text>
      </div>
    ) : (
      <TextInput {...common} inputMode={number ? 'decimal' : undefined} />
    )
  }

  const start = () => {
    done.current = false
    setDraft(value)
  }
  return (
    <div
      className={`field ${value ? '' : 'empty'} ${className ?? ''}`}
      data-field={field}
      role="button"
      tabIndex={0}
      aria-label={`${label} bearbeiten`}
      onClick={start}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'F2') {
          e.preventDefault()
          start()
        }
      }}
    >
      {value ? (display ?? value) : placeholder}
    </div>
  )
}

/** Zeitspanne mit zwei Griffen auf den Zeitpunkten; außen heißt offen, beide auf einem Punkt heißt `at` (Festlegung 17) */
export function SpanField({ span, onCommit, label }: { span: Span; onCommit: (span: Span) => void; label: string }) {
  const { book, points } = useUi()
  const [dragged, setDragged] = useState<Span | null>(null)
  const shown = dragged ?? span
  const last = points.length - 1
  return (
    <Group gap="sm" wrap="nowrap" className="span-field">
      <RangeSlider
        flex={1}
        size="sm"
        min={0}
        max={Math.max(last, 1)}
        step={1}
        minRange={0}
        disabled={last < 1}
        value={shown}
        onChange={(v) => setDragged(v)}
        onChangeEnd={(v) => {
          setDragged(null)
          if (v[0] !== span[0] || v[1] !== span[1]) onCommit(v)
        }}
        label={(i) => `${i + 1}. ${points[i]?.name ?? ''}`}
        marks={points.map((_, i) => ({ value: i }))}
        thumbFromLabel={`${label}: Beginn`}
        thumbToLabel={`${label}: Ende`}
      />
      <Text size="xs" c="dimmed" w={60} ta="right" data-testid="span-label">
        {spanLabel(book, shown)}
      </Text>
    </Group>
  )
}

/** Farbpunkt, der eine Palette mit Hex-Eingabe öffnet */
export function ColorField({ value, onCommit }: { value: string; onCommit: (color: string) => void }) {
  const [opened, setOpened] = useState(false)
  const [hex, setHex] = useState(value)
  const set = (color: string) => {
    setOpened(false)
    if (/^#[0-9a-f]{6}$/i.test(color) && color.toLowerCase() !== value.toLowerCase()) onCommit(color.toLowerCase())
  }
  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" shadow="lg" trapFocus>
      <Popover.Target>
        <UnstyledButton className="color-dot" style={{ background: value }} aria-label="Farbe ändern" onClick={() => (setHex(value), setOpened((o) => !o))} />
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <SimpleGrid cols={6} spacing={6}>
            {PALETTE.map((c) => (
              <ColorSwatch key={c} component="button" color={c} size={24} aria-label={c} onClick={() => set(c)} style={{ outline: c === value ? '2px solid white' : undefined }} />
            ))}
          </SimpleGrid>
          <TextInput size="xs" aria-label="Hex-Farbe" value={hex} onChange={(e) => setHex(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && set(hex.trim())} />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

/** Eintrag einer Auswahlliste */
export interface Option {
  id: string
  label: string
  color?: string
  hint?: string
}

interface PickerProps {
  options: Option[]
  onPick: (id: string) => void
  /** Bei unbekanntem Suchtext: Einträge zum Anlegen (Festlegung 30) */
  creates?: { label: (query: string) => string; run: (query: string) => void }[]
  title?: string
  placeholder?: string
  opened: boolean
  onClose: () => void
  target: ReactNode
}

/** Suchliste mit Tastatur und „Neu anlegen“ für Verweisfelder und Menüs */
export function Picker({ options, onPick, creates = [], title, placeholder = 'Suchen oder neu anlegen …', opened, onClose, target }: PickerProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const q = query.trim().toLowerCase()
  const shown = options.filter((o) => !q || o.label.toLowerCase().includes(q))
  const exact = options.some((o) => o.label.toLowerCase() === q)
  const items = [...shown.map((o) => ({ ...o, run: () => onPick(o.id) })), ...(q && !exact ? creates.map((c, k) => ({ id: `+${k}`, label: c.label(query.trim()), create: true, run: () => c.run(query.trim()) })) : [])]
  const choose = (item?: (typeof items)[number]) => {
    if (!item) return
    setQuery('')
    onClose()
    item.run()
  }
  return (
    <Popover opened={opened} onChange={(o) => !o && onClose()} position="bottom-start" shadow="lg" width={280} withinPortal>
      <Popover.Target>{target}</Popover.Target>
      <Popover.Dropdown p={6}>
        {title && (
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" px={6} pb={4}>
            {title}
          </Text>
        )}
        <TextInput
          size="sm"
          autoFocus
          aria-label={title ?? 'Suchen'}
          placeholder={placeholder}
          value={query}
          onChange={(e) => (setQuery(e.currentTarget.value), setActive(0))}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(items.length, 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              choose(items[active])
            } else if (e.key === 'Escape') {
              e.stopPropagation()
              onClose()
            }
          }}
        />
        <Stack gap={0} mt={4} mah={260} style={{ overflowY: 'auto' }} role="listbox">
          {items.map((item, k) => (
            <UnstyledButton key={item.id} role="option" aria-selected={k === active} className={`pick-option ${k === active ? 'active' : ''} ${'create' in item ? 'create' : ''}`} onMouseEnter={() => setActive(k)} onClick={() => choose(item)}>
              {'create' in item ? '+ ' : item.color && <span className="dot" style={{ background: item.color }} />}
              <span>{item.label}</span>
              {'hint' in item && item.hint && <Text span size="xs" c="dimmed" ml="auto">{item.hint}</Text>}
            </UnstyledButton>
          ))}
          {!items.length && (
            <Text size="sm" c="dimmed" p={6}>
              Nichts gefunden
            </Text>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

/** Knopf, der einen Verweis anzeigt und eine Suchliste öffnet */
export function RefPicker(props: Omit<PickerProps, 'opened' | 'onClose' | 'target'> & { value?: string; empty?: string; label: string }) {
  const { book } = useUi()
  const [opened, setOpened] = useState(false)
  const current = props.options.find((o) => o.id === props.value)
  return (
    <Picker
      {...props}
      opened={opened}
      onClose={() => setOpened(false)}
      target={
        <UnstyledButton className="pick" aria-label={props.label} onClick={() => setOpened((o) => !o)} data-book={book.title ? undefined : ''}>
          {current ? (
            <>
              {current.color && <span className="dot" style={{ background: current.color }} />}
              {current.label}
            </>
          ) : (
            <Text span size="sm" c="dimmed">
              {props.empty ?? 'wählen'}
            </Text>
          )}
        </UnstyledButton>
      }
    />
  )
}

/** Datum als Text, mit ⓘ und dem Abstand zur nächsten Zeitrechnung im Tooltip */
export function DateText({ cal, date, prefix }: { cal: Calendar; date: BookDate; prefix?: string }) {
  const next = untilNextEra(cal, date)
  return (
    <Group component="span" gap={4} wrap="nowrap" display="inline-flex">
      <Text span size="xs" c="dimmed">
        {prefix}
        {formatDate(cal, date)}
      </Text>
      {next && (
        <Tooltip label={next}>
          <Text span size="xs" c="dimmed" className="era-info" tabIndex={0} aria-label={next}>
            ⓘ
          </Text>
        </Tooltip>
      )}
    </Group>
  )
}
