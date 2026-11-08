import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { copies, imageCache, type ImageRef, type WorkingCopy } from '../github/store'
import { changes, currentImages } from '../github/sync'
import type { Book } from '../model'
import { imageUrls, rememberCopy, type ActiveBook } from '../storage/active'
import { filesToBook, imagePath, newId, type LoadError } from '../storage/format'
import type { Selection } from '../ui/types'
import { backgroundSize } from './backgroundSize'
import { allIds, produce, type Recipe } from './ops'
import { gitBlobSha, saveBook } from './save'

/** Stand der automatischen Speicherung */
export type SaveStatus = 'saved' | 'saving' | 'error'

/** Wo man beim Ändern war; Rückgängig springt dorthin zurück */
export interface EditContext {
  selection: Selection | null
  current: number
}

/** Ein Rückgängig-Schritt: Buch vorher und nachher */
export interface Step extends EditContext {
  label: string
  before: Book
  after: Book
}

interface State {
  book: Book
  errors: LoadError[]
  past: Step[]
  future: Step[]
}

/** Ergebnis einer Änderung: übernommen, verhindert (mit Grund) oder ohne Wirkung */
export type Applied = { ok: true } | { ok: false; blocked?: string }

const HISTORY = 200
const SAVE_DELAY = 300

// Gleiche Inhalte, unabhängig von der Reihenfolge der Schlüssel (IndexedDB liefert Dateien sortiert)
const canonical = (value: unknown): unknown =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]))
    : Array.isArray(value)
      ? value.map(canonical)
      : value
const sameCopy = (a: WorkingCopy, b: WorkingCopy) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))

/** Bearbeitbares Buch: Verlauf bis zum Neuladen (Festlegung 6), Speichern als Dateiunterschied (54), Neuladen bei Tabwechsel (57) */
export function useEditor(active: ActiveBook, onReloaded: () => void) {
  const [state, setState] = useState<State>({ book: active.book, errors: active.errors, past: [], future: [] })
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [copy, setCopy] = useState(active.copy)
  const stateRef = useRef(state)
  const saved = useRef({ book: active.book, copy: active.copy })
  const uploads = useRef(new Map<string, ImageRef>())
  const [uploaded, setUploaded] = useState<string[]>([])
  const queue = useRef(Promise.resolve())
  const reloaded = useRef(onReloaded)
  const imageUrl = useMemo(() => imageUrls(active.copy.repo), [active.copy.repo])

  useEffect(() => {
    reloaded.current = onReloaded
  })

  const commit = useCallback((next: State) => {
    stateRef.current = next
    setState(next)
  }, [])

  const flush = useCallback(() => {
    queue.current = queue.current.then(async () => {
      const book = stateRef.current.book
      if (book === saved.current.book) return
      try {
        const next = saveBook(saved.current.copy, saved.current.book, book, uploads.current)
        await copies.put(next)
        saved.current = { book, copy: next }
        rememberCopy(next)
        setCopy(next)
        setStatus(stateRef.current.book === book ? 'saved' : 'saving')
      } catch {
        setStatus('error')
      }
    })
    return queue.current
  }, [])

  useEffect(() => {
    if (state.book === saved.current.book) return
    setStatus('saving')
    const timer = setTimeout(flush, SAVE_DELAY)
    return () => clearTimeout(timer)
  }, [state.book, flush])

  useEffect(() => {
    const onVisibility = async () => {
      await flush()
      if (document.visibilityState === 'hidden') return
      const stored = await copies.get(saved.current.copy.repo).catch(() => undefined)
      if (!stored || sameCopy(stored, saved.current.copy)) return
      const { book, errors } = filesToBook(stored.files, Object.keys(currentImages(stored)))
      saved.current = { book, copy: stored }
      rememberCopy(stored)
      setCopy(stored)
      commit({ book, errors, past: [], future: [] })
      reloaded.current()
    }
    const onHide = () => void flush()
    document.addEventListener('visibilitychange', onVisibility)
    addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      removeEventListener('pagehide', onHide)
    }
  }, [flush, commit])

  const apply = useCallback(
    (label: string, recipe: Recipe, context: EditContext): Applied => {
      const s = stateRef.current
      const result = produce(s.book, recipe)
      if (!result) return { ok: false }
      if ('blocked' in result) return { ok: false, blocked: result.blocked }
      commit({ ...s, book: result.book, past: [...s.past.slice(1 - HISTORY), { label, before: s.book, after: result.book, ...context }], future: [] })
      return { ok: true }
    },
    [commit],
  )

  const undo = useCallback(() => {
    const s = stateRef.current
    const step = s.past.at(-1)
    if (step) commit({ ...s, book: step.before, past: s.past.slice(0, -1), future: [...s.future, step] })
    return step
  }, [commit])

  const redo = useCallback(() => {
    const s = stateRef.current
    const step = s.future.at(-1)
    if (step) commit({ ...s, book: step.after, past: [...s.past, step], future: s.future.slice(0, -1) })
    return step
  }, [commit])

  // Alte Dateien ohne Höhe des Hintergrunds: einmal aus dem Bild ergänzen, als normale Änderung
  const measured = useRef(new Set<string>())
  useEffect(() => {
    for (const point of state.book.timePoints) {
      const background = point.background
      if (!background || background.height !== undefined || measured.current.has(background.id)) continue
      measured.current.add(background.id)
      imageUrl(background.file)
        .then((url) => (url ? fetch(url).then((r) => r.blob()).then(backgroundSize) : undefined))
        .then((size) => {
          if (!size) return
          apply('Höhe des Hintergrunds ergänzt', (d) => {
            const target = d.timePoints.find((t) => t.background?.id === background.id)?.background
            if (target && target.height === undefined) target.height = Math.round((target.width * size.height * 10) / size.width) / 10
          }, { selection: null, current: 0 })
        })
        .catch(() => undefined)
    }
  }, [state.book, imageUrl, apply])

  /** Ergebnis einer Änderung ohne Verlauf, z. B. als Vorschau beim Ziehen */
  const preview = useCallback((recipe: Recipe) => {
    const result = produce(stateRef.current.book, recipe)
    return result && 'book' in result ? result.book : undefined
  }, [])

  /** Legt eine Bilddatei im Browser-Speicher ab und liefert ihren Pfad im Buch */
  const upload = useCallback(async (file: File, name: string) => {
    const sha = await gitBlobSha(file)
    const path = imagePath(name, newId(allIds(stateRef.current.book)), file.name.split('.').pop() ?? '')
    const copy = saved.current.copy
    await imageCache.put(copy.repo, sha, file)
    const ref = { sha, size: file.size }
    uploads.current.set(path, ref)
    // Sofort anzeigbar, gespeichert wird es mit der nächsten Änderung am Buch
    rememberCopy({ ...copy, imageChanges: { ...copy.imageChanges, [path]: ref } })
    setUploaded((list) => [...list, path])
    return path
  }, [])

  const images = useMemo(() => [...new Set([...Object.keys(currentImages(copy)), ...uploaded])], [copy, uploaded])

  return {
    book: state.book,
    errors: state.errors,
    copy,
    status,
    changes: changes(copy).length,
    undoLabel: state.past.at(-1)?.label,
    redoLabel: state.future.at(-1)?.label,
    images,
    imageUrl,
    apply,
    undo,
    redo,
    preview,
    upload,
  }
}
