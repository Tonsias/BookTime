import { useEffect, useState } from 'react'
import { Spotlight, spotlight, type SpotlightActionGroupData } from '@mantine/spotlight'
import type { NewKind } from '../edit/ops'
import { calendarOf, formatDate } from '../calendar'
import { bounds, elementColor, type ElementKind } from '../model'
import { useUi } from './context'

const CREATE: [NewKind, string][] = [
  ['person', 'Person'],
  ['place', 'Ort'],
  ['event', 'Event'],
  ['group', 'Gruppe'],
]

/** Suche über alles im Buch (Strg+K); unbekannter Text lässt sich direkt anlegen (Festlegung 29) */
export function Search({ onCreate }: { onCreate: (kind: NewKind, name: string) => void }) {
  const { book, points, select, jump } = useUi()
  const [query, setQuery] = useState('')

  // Kurzbefehl selbst behandeln: Mantine fokussiert das Suchfeld erst nach dem Öffnen, Getipptes bis dahin wird gepuffert
  useEffect(() => {
    let buffering = false
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable]')
      const input = document.querySelector<HTMLInputElement>('.mantine-Spotlight-search')
      if (!buffering && !typing && ((e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) || e.key === '/')) {
        e.preventDefault()
        buffering = true
        spotlight.open()
      } else if (buffering && e.target !== input && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        setQuery((q) => q + e.key)
        input?.focus()
      }
    }
    const stop = () => (buffering = false)
    addEventListener('keydown', onKey, true)
    addEventListener('booktime-search-closed', stop)
    return () => {
      removeEventListener('keydown', onKey, true)
      removeEventListener('booktime-search-closed', stop)
    }
  }, [])
  const dot = (color: string) => <span className="dot" style={{ background: color }} />
  const group = (kind: ElementKind, name: string, items: { id: string; label: string; description: string }[], onPick?: (id: string) => void): SpotlightActionGroupData => ({
    group: name,
    actions: items.map((e) => ({
      id: e.id,
      label: e.label,
      description: e.description,
      leftSection: dot(elementColor(book, e.id)),
      onClick: () => {
        onPick?.(e.id)
        select({ kind, id: e.id })
      },
    })),
  })
  const named = (list: { id: string; name: string; description: string }[]) => list.map((e) => ({ id: e.id, label: e.name, description: e.description }))
  const text = query.trim()
  const known = [...book.persons, ...book.groups, ...book.places].some((e) => e.name.toLowerCase() === text.toLowerCase()) || book.events.some((e) => e.title.toLowerCase() === text.toLowerCase())

  const actions: SpotlightActionGroupData[] = [
    group('person', 'Personen', named(book.persons)),
    group('group', 'Gruppen', named(book.groups)),
    group('place', 'Orte', named(book.places)),
    group(
      'event',
      'Events',
      book.events.map((e) => ({ id: e.id, label: e.title, description: e.description })),
      (id) => jump(bounds(book, book.events.find((e) => e.id === id)!.timing)[0]),
    ),
    {
      group: 'Zeitpunkte',
      actions: points.map((t, i) => ({
        id: t.id,
        label: `${i + 1}. ${t.name}`,
        description: [t.dateLabel, t.date && formatDate(calendarOf(book), t.date)].filter(Boolean).join(' · '),
        onClick: () => {
          jump(i)
          select({ kind: 'timePoint', id: t.id })
        },
      })),
    },
    {
      group: 'Beziehungsarten',
      actions: book.relationTypes.map((t) => ({ id: t.id, label: t.name, description: t.category, leftSection: dot(t.color), onClick: () => select({ kind: 'relationType', id: t.id }) })),
    },
    ...(text && !known
      ? [{ group: 'Neu anlegen', actions: CREATE.map(([kind, label]) => ({ id: `neu-${kind}`, label: `„${text}“ als ${label} anlegen`, onClick: () => onCreate(kind, text) })) }]
      : []),
  ]

  return (
    <Spotlight
      actions={actions}
      query={query}
      onQueryChange={setQuery}
      shortcut={null}
      onSpotlightClose={() => {
        setQuery('')
        dispatchEvent(new Event('booktime-search-closed'))
      }}
      nothingFound="Nichts gefunden"
      highlightQuery
      searchProps={{ placeholder: 'Person, Gruppe, Ort, Event, Zeitpunkt … oder neu anlegen' }}
    />
  )
}
