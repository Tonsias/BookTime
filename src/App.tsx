import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useHotkeys } from '@mantine/hooks'
import { hintKey, openHints, type Hint } from './checks'
import type { Fix } from './edit/fixes'
import { fixesFor } from './edit/fixes'
import { addImage, allIds, byId, connect, create, dependents, movePlace, moveStay, removeElement, type NewKind, type Recipe, type Scope } from './edit/ops'
import { useEditor, type Step } from './edit/useEditor'
import { findElement, focusSet, timeline, type Book, type StoryEvent } from './model'
import { Gestures, type Grab, type Projector } from './scene/Gestures'
import type { DropKind, Target } from './scene/hits'
import { computeLayout, type NetPos } from './scene/layout'
import { Scene } from './scene/Scene'
import { addFirstTimePoint, useActiveBook, type ActiveBook } from './storage/active'
import { newId } from './storage/format'
import { Timebar, Toolbar, Tray } from './ui/Bars'
import { UiContext, type BookUi } from './ui/context'
import { DeleteDialog, HintDialog, Toasts, type Toast } from './ui/Dialogs'
import { ErrorPage, ErrorView } from './ui/ErrorView'
import { Picker } from './ui/fields'
import { Panel } from './ui/panel/Panel'
import { Search } from './ui/Search'
import type { Selection, View } from './ui/types'

/** Hauptansicht: lädt das aktive Buch und zeigt es */
function App() {
  const active = useActiveBook()
  if (!active) return null
  if (active instanceof Error) return <ErrorPage error={active} />
  return active.book.timePoints.length ? <BookView active={active} /> : <EmptyBook active={active} />
}

/** Ohne Zeitpunkt gibt es keine Ebene, also nichts anzuzeigen */
function EmptyBook({ active }: { active: ActiveBook }) {
  const { repo, errors } = active
  return (
    <ErrorView
      title="Dieses Buch hat noch keine Zeitpunkte"
      message={
        <>
          Ohne Zeitpunkt lässt sich nichts anzeigen. Lege einen ersten Zeitpunkt „Anfang“ an und committe ihn danach auf der GitHub-Seite.
          {errors.length > 0 && ` Außerdem sind ${errors.length} Dateien fehlerhaft, darunter vielleicht Zeitpunkte.`}
        </>
      }
      fixes={[
        ...(repo ? [{ label: 'Ersten Zeitpunkt anlegen', run: () => addFirstTimePoint(repo).then(() => location.reload()) }] : []),
        { label: 'Zur GitHub-Seite', href: 'github.html' },
      ]}
    />
  )
}

const KIND_NAMES: Record<NewKind, string> = { person: 'Person', group: 'Gruppe', place: 'Ort', event: 'Event', timePoint: 'Zeitpunkt', relationType: 'Beziehungsart' }
const VIEWS: View[] = ['raum', 'netz', 'zeit']
const NEW_KEYS: [string, NewKind][] = [
  ['P', 'person'],
  ['O', 'place'],
  ['E', 'event'],
  ['Z', 'timePoint'],
]

const useToasts = () => {
  const [toasts, setToasts] = useState<Toast[]>([])
  const next = useRef(0)
  const toast = useCallback((text: string, extra: Omit<Toast, 'id' | 'text'> = {}) => {
    const id = ++next.current
    setToasts((list) => [...list.slice(-2), { id, text, ...extra }])
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), extra.error ? 6000 : 4500)
  }, [])
  const dismiss = (id: number) => setToasts((list) => list.filter((t) => t.id !== id))
  return { toasts, toast, dismiss }
}

const pickFile = () =>
  new Promise<File | undefined>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => resolve(input.files?.[0])
    input.click()
  })

/** 3D-Szene mit Werkzeugleiste, Zeitleiste, Editor-Panel, Suche und Dialogen */
function BookView({ active }: { active: ActiveBook }) {
  const [view, setView] = useState<View>('raum')
  const [current, setCurrent] = useState(0)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [scope, setScope] = useState<Scope>('hier')
  const [editRequest, requestEdit] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(() => new Set<string>())
  const [hintIndex, setHintIndex] = useState<number | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [deleting, setDeleting] = useState<{ name: string; items: string[]; run: () => void } | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [preview, setPreview] = useState<Book | null>(null)
  const [relationMenu, setRelationMenu] = useState<{ a: string; c: string; x: number; y: number } | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const projector = useRef<Projector | null>(null)
  const attachProjector = useCallback((p: Projector | null) => void (projector.current = p), [])
  const grab = useRef<Grab | null>(null)
  const { toasts, toast, dismiss } = useToasts()

  const editor = useEditor(active, () => toast('Die Arbeitskopie wurde in einem anderen Tab geändert und neu geladen.'))
  const { book } = editor
  const points = useMemo(() => timeline(book), [book])
  const i = Math.min(current, points.length - 1)
  const shown = preview ?? book
  const layout = useMemo(() => computeLayout(shown, timeline(shown).length), [shown])
  const focus = useMemo(() => focusSet(book, selection && selection.kind !== 'book' ? selection.id : null), [book, selection])
  const notes = useMemo(() => openHints(book, editor.images), [book, editor.images])
  const name = (id: string) => findElement(book, id)?.label ?? book.timePoints.find((t) => t.id === id)?.name ?? book.relationTypes.find((t) => t.id === id)?.name ?? id

  const change = useCallback(
    (label: string, recipe: Recipe) => {
      const result = editor.apply(label, recipe, { selection, current: i })
      if (!result.ok && result.blocked) toast(`Nicht möglich: ${result.blocked}`, { error: true })
      return result.ok
    },
    [editor, selection, i, toast],
  )

  const restore = (step: Step | undefined, verb: string) => {
    if (!step) return
    setSelection(step.selection)
    setCurrent(step.current)
    toast(`${verb}: ${step.label}`)
  }
  const undo = () => restore(editor.undo(), 'Rückgängig')
  const redo = () => restore(editor.redo(), 'Wiederholt')
  const jump = (index: number) => setCurrent(Math.max(0, Math.min(points.length - 1, index)))

  const createNew = (kind: NewKind, title = '', at?: NetPos) => {
    let id = ''
    if (!change(`${KIND_NAMES[kind]} angelegt`, (d) => void (id = create(d, kind, i, title, at && { x: at[0], y: at[1] })))) return
    if (kind === 'timePoint') setCurrent(i + 1)
    setSelection({ kind, id })
    if (!title) requestEdit(`name:${id}`)
    if (kind === 'person') setFresh(id)
  }

  const remove = (id: string) => {
    if (points.some((t) => t.id === id) && points.length <= 1) return toast('Der letzte Zeitpunkt lässt sich nicht löschen', { error: true })
    const title = name(id)
    const run = () => {
      if (!change(`${title} gelöscht`, (d) => void removeElement(d, id))) return
      setSelection(null)
      toast(`„${title}“ gelöscht`, { undo: true })
    }
    const items = dependents(book, id)
    if (items.length) setDeleting({ name: title, items, run })
    else run()
  }

  const openHint = (key?: string) => {
    setHintIndex(Math.max(0, key ? notes.findIndex((h) => hintKey(h) === key) : 0))
    setAccepting(false)
  }
  const shownHint = hintIndex === null ? undefined : notes[hintIndex]
  const shownKey = shownHint && hintKey(shownHint)
  useEffect(() => {
    if (!shownHint) return
    setCurrent(shownHint.at)
    const el = shownHint.els[0]
    const kind = el && findElement(book, el)?.kind
    setSelection(kind ? { kind, id: el } : { kind: 'timePoint', id: points[shownHint.at]!.id })
    // Nur beim Wechsel des Hinweises springen, nicht bei jeder Änderung am Buch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey])

  const fix = async (hint: Hint, chosen: Fix) => {
    if (chosen.upload) {
      const file = await pickFile()
      if (!file) return
      const path = await editor.upload(file, name(hint.els[0] ?? 'bild'))
      if (change('Bild neu hochgeladen', (d) => void (byId<{ file: string }>(d, chosen.upload!).file = path))) toast('Bild neu hochgeladen', { undo: true })
      return
    }
    if (chosen.recipe && change(`Hinweis gelöst: ${chosen.label}`, chosen.recipe)) toast(`Gelöst: ${chosen.label}`, { undo: true })
  }
  const accept = (hint: Hint, note: string) => {
    setAccepting(false)
    if (change('Als gewollt markiert', (d) => void d.acceptedHints.push({ rule: hint.rule, ids: hint.ids, ...(note ? { note } : {}) }))) toast('Als gewollt markiert', { undo: true })
  }
  const solveSelf = (hint: Hint) => {
    setHintIndex(null)
    setExpanded((set) => new Set([...set, hint.ids[0]!]))
  }

  const addImageTo = async (owner: string, file: File) => {
    const path = await editor.upload(file, name(owner))
    change('Bild hinzugefügt', (d) => void addImage(d, owner, path))
  }
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      const owner = selection && findElement(book, selection.id)
      if (file && owner) void addImageTo(selection.id, file)
    }
    addEventListener('paste', onPaste)
    return () => removeEventListener('paste', onPaste)
  })

  const onDrop = (kind: DropKind, source: Target, target: Target, at: { x: number; y: number }) => {
    const label = `${name(source.id)} → ${name(target.id)}`
    if (kind === 'stay' && change(label, (d) => moveStay(d, source.id, target.id, i, scope))) setSelection({ kind: 'person', id: source.id })
    if (kind === 'participation') change(label, (d) => void d.facts.push({ kind: 'participation', id: newId(allIds(d)), actor: source.id, event: target.id }))
    if (kind === 'event-place') change(label, (d) => void (byId<StoryEvent>(d, source.id).place = target.id))
    if (kind === 'relation') setRelationMenu({ a: source.id, c: target.id, ...at })
    setFresh(null)
  }
  const onPlace = (id: string, pos: NetPos | null, done: boolean) => {
    if (!done) return setPreview(pos ? (editor.preview((d) => movePlace(d, id, i, pos[0], pos[1], scope)) ?? null) : null)
    setPreview(null)
    if (pos) change(`Lage von ${name(id)}`, (d) => movePlace(d, id, i, pos[0], pos[1], scope))
  }

  const modal = !!deleting || !!relationMenu
  const numberKey = (k: number) => () => {
    const fixes = shownHint ? fixesFor(book, shownHint).fixes : []
    if (hintIndex === null) setView(VIEWS[k]!)
    else if (shownHint && fixes[k]) void fix(shownHint, fixes[k])
  }
  const sliderFocused = () => document.activeElement?.getAttribute('role') === 'slider'
  useHotkeys([
    ['mod+Z', undo],
    ['mod+Y', redo],
    ['mod+shift+Z', redo],
    ['N', () => setNewOpen(true)],
    ['F2', () => selection && requestEdit(selection.kind === 'book' ? 'title' : `name:${selection.id}`)],
    ['Delete', () => !modal && selection && selection.kind !== 'book' && remove(selection.id)],
    ['ArrowLeft', () => !sliderFocused() && jump(i - 1)],
    ['ArrowRight', () => !sliderFocused() && jump(i + 1)],
    ['Escape', () => !modal && (hintIndex !== null ? setHintIndex(null) : setSelection(null))],
    ['1', numberKey(0)],
    ['2', numberKey(1)],
    ['3', numberKey(2)],
    ['S', () => hintIndex !== null && setHintIndex(hintIndex + 1)],
    ['G', () => hintIndex !== null && setAccepting(true)],
    // Buchstaben im geöffneten Menü „Neu“; das Menü selbst bekommt beim Öffnen per Taste keinen Fokus
    ...NEW_KEYS.map(([key, kind]): [string, () => void] => [key, () => newOpen && (setNewOpen(false), createNew(kind))]),
  ])

  const ui: BookUi = {
    book,
    points,
    current: i,
    scope,
    hints: notes,
    selection,
    sample: active.repo === null,
    change,
    select: setSelection,
    jump,
    remove,
    openHint,
    editRequest,
    requestEdit,
    expanded,
    toggle: (id, open) => setExpanded((set) => (open ?? !set.has(id) ? new Set([...set, id]) : new Set([...set].filter((x) => x !== id)))),
    upload: editor.upload,
    imageUrl: editor.imageUrl,
  }

  return (
    <UiContext.Provider value={ui}>
      <div className="app">
        <Gestures
          book={book}
          layout={layout}
          current={i}
          scope={scope}
          enabled={view !== 'zeit'}
          projector={projector}
          grab={grab}
          onSelect={setSelection}
          onPlace={onPlace}
          onDrop={onDrop}
          onCreatePlace={(pos) => createNew('place', '', pos)}
        >
          <Scene book={shown} imageUrl={editor.imageUrl} points={timeline(shown)} layout={layout} current={i} view={view} selection={selection} focus={focus} onSelect={setSelection} onJump={jump} onProjector={attachProjector} />
        </Gestures>

        {hintIndex === null ? (
          <Toolbar
            repo={active.repo}
            errors={editor.errors.length}
            status={editor.status}
            changes={editor.changes}
            undoLabel={editor.undoLabel}
            redoLabel={editor.redoLabel}
            view={view}
            newOpen={newOpen}
            onNewOpen={setNewOpen}
            onNew={(kind) => createNew(kind)}
            onView={setView}
            onUndo={undo}
            onRedo={redo}
          />
        ) : (
          <HintDialog index={hintIndex} accepting={accepting} onAccepting={setAccepting} onIndex={setHintIndex} onClose={() => setHintIndex(null)} onFix={(h, f) => void fix(h, f)} onAccept={accept} onSelf={solveSelf} />
        )}

        <Panel />
        <Tray layout={layout} fresh={fresh} onGrab={(e, kind, id) => grab.current?.(e, kind, id)} />
        <Timebar onScope={setScope} onAdd={() => createNew('timePoint')} />
        <Search onCreate={(kind, title) => createNew(kind, title)} />
        <Toasts
          items={toasts}
          onUndo={(id) => {
            dismiss(id)
            undo()
          }}
        />
        {deleting && (
          <DeleteDialog
            name={deleting.name}
            items={deleting.items}
            onClose={() => setDeleting(null)}
            onConfirm={() => {
              setDeleting(null)
              deleting.run()
            }}
          />
        )}
        {relationMenu && (
          <Picker
            opened
            onClose={() => setRelationMenu(null)}
            title={`${name(relationMenu.a)} → ${name(relationMenu.c)}`}
            placeholder="Beziehungsart suchen oder neu anlegen …"
            options={book.relationTypes.map((t) => ({ id: t.id, label: t.name, color: t.color, hint: `${name(relationMenu.a)} ${t.directed ? '→' : '↔'} ${name(relationMenu.c)}` }))}
            onPick={(type) => change(`Beziehung ${name(relationMenu.a)} → ${name(relationMenu.c)}`, (d) => connect(d, relationMenu.a, relationMenu.c, type, i, scope))}
            creates={[{ label: (q) => `Neue Art „${q}“`, run: (q) => change(`Beziehung ${name(relationMenu.a)} → ${name(relationMenu.c)}`, (d) => connect(d, relationMenu.a, relationMenu.c, create(d, 'relationType', i, q), i, scope)) }]}
            target={<div className="menu-anchor" style={{ left: relationMenu.x, top: relationMenu.y }} />}
          />
        )}
      </div>
    </UiContext.Provider>
  )
}

export default App
