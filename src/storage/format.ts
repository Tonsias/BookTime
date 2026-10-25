import { problems } from '../checks'
import type { Book, Fact } from '../model'

/** Dateiinhalte eines Buchs, Pfad relativ zum Repo-Wurzelordner */
export type BookFiles = Record<string, string>

/** Datei, die beim Laden übersprungen wurde */
export interface LoadError {
  path: string
  reason: string
}

/** Höchste Formatversion, die diese App lesen kann */
export const FORMAT = 1

type RefKind = 'timePoint' | 'person' | 'group' | 'actor' | 'place' | 'event' | 'relationType'
type Scalar = 'id' | 'string' | 'number' | 'positive' | 'boolean' | 'color' | 'timing' | 'strength' | RefKind
interface Spec {
  [key: string]: Scalar | `${Scalar}?` | [Spec] | Spec
}

const IMAGE: Spec = { id: 'id', file: 'string', order: 'number', timing: 'timing?', note: 'string?' }
const NAMED: Spec = { id: 'id', name: 'string', color: 'color', existence: 'timing', images: [IMAGE] }
const TIMED: Spec = { timing: 'timing', causedBy: 'event?' }

interface Kind {
  key: keyof Omit<Book, 'title' | 'note' | 'facts'> | Fact['kind']
  folder: string
  spec: Spec
  texts: string[]
  names: string[]
}

const KINDS: Kind[] = [
  {
    key: 'timePoints',
    folder: 'time-points',
    spec: { id: 'id', name: 'string', dateLabel: 'string?', order: 'number', background: { id: 'id', file: 'string', x: 'number', y: 'number', width: 'positive', note: 'string?' } },
    texts: ['note'],
    names: ['name'],
  },
  { key: 'persons', folder: 'persons', spec: NAMED, texts: ['description', 'note'], names: ['name'] },
  { key: 'groups', folder: 'groups', spec: NAMED, texts: ['description', 'note'], names: ['name'] },
  {
    key: 'places',
    folder: 'places',
    spec: { ...NAMED, radius: 'number?', phases: [{ id: 'id', timing: 'timing', parent: 'place?', x: 'number', y: 'number', images: [IMAGE], note: 'string?' }] },
    texts: ['description', 'note'],
    names: ['name'],
  },
  {
    key: 'events',
    folder: 'events',
    spec: { id: 'id', title: 'string', color: 'color', timing: 'timing', place: 'place?', images: [IMAGE] },
    texts: ['description', 'result', 'note'],
    names: ['title'],
  },
  {
    key: 'relationTypes',
    folder: 'relation-types',
    spec: { id: 'id', name: 'string', category: 'string', directed: 'boolean', inverseName: 'string?', color: 'color' },
    texts: ['note'],
    names: ['name'],
  },
  { key: 'stay', folder: 'facts/stays', spec: { id: 'id', person: 'person', place: 'place', ...TIMED }, texts: ['note'], names: ['person', 'place'] },
  {
    key: 'journey',
    folder: 'facts/journeys',
    spec: { id: 'id', person: 'person', origin: 'place', destination: 'place', ...TIMED },
    texts: ['note'],
    names: ['person', 'origin', 'destination'],
  },
  {
    key: 'participation',
    folder: 'facts/participations',
    spec: { id: 'id', actor: 'actor', event: 'event', role: 'string?', timing: 'timing?', causedBy: 'event?' },
    texts: ['note'],
    names: ['actor', 'event'],
  },
  {
    key: 'membership',
    folder: 'facts/memberships',
    spec: { id: 'id', person: 'person', group: 'group', role: 'string?', ...TIMED },
    texts: ['note'],
    names: ['person', 'group'],
  },
  {
    key: 'relation',
    folder: 'facts/relations',
    spec: {
      id: 'id',
      from: 'actor',
      to: 'actor',
      phases: [{ id: 'id', timing: 'timing', type: 'relationType', strength: 'strength', causedBy: 'event?', note: 'string?' }],
    },
    texts: ['note'],
    names: ['from', 'to'],
  },
]

const isFactKind = (key: Kind['key']): key is Fact['kind'] => !key.endsWith('s')

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTS[c] ?? c)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '') || 'ohne-name'

const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n'

const ordered = (value: Record<string, unknown>, spec: Spec): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(spec)) {
    const v = value[key]
    if (v === undefined) continue
    if (Array.isArray(field)) out[key] = (v as Record<string, unknown>[]).map((item) => ordered(item, field[0]))
    else if (typeof field === 'object') out[key] = ordered(v as Record<string, unknown>, field)
    else out[key] = field.startsWith('timing') ? orderTiming(v) : v
  }
  return out
}

const orderTiming = (t: unknown) => {
  const { at, from, to } = t as Record<string, string | undefined>
  return at !== undefined ? { at } : { from, to }
}

/** Alle Dateien eines Buchs im Repo-Format */
export function bookToFiles(book: Book): BookFiles {
  const files: BookFiles = { 'booktime.json': json({ format: FORMAT, title: book.title }) }
  if (book.note) files['booktime.note.md'] = book.note + '\n'
  const labels = new Map<string, string>()
  for (const list of [book.timePoints, book.persons, book.groups, book.places, book.relationTypes]) list.forEach((e) => labels.set(e.id, e.name))
  book.events.forEach((e) => labels.set(e.id, e.title))

  for (const kind of KINDS) {
    const items = (isFactKind(kind.key) ? book.facts.filter((f) => f.kind === kind.key) : book[kind.key]) as unknown as Record<string, unknown>[]
    for (const item of items) {
      const name = kind.names.map((n) => slug(isFactKind(kind.key) ? (labels.get(item[n] as string) ?? String(item[n])) : String(item[n]))).join('-')
      const base = `${kind.folder}/${name}-${item.id}`
      files[`${base}.json`] = json(ordered(item, kind.spec))
      for (const text of kind.texts) if (item[text]) files[`${base}.${text}.md`] = item[text] + '\n'
    }
  }
  return files
}

type Ref = { kind: RefKind; id: string }

const COLOR = /^#[0-9a-f]{6}$/i

function check(value: unknown, field: Spec[string], where: string, refs: Ref[]): string | undefined {
  const optional = typeof field === 'string' ? field.endsWith('?') : !Array.isArray(field)
  if (value === undefined) return optional ? undefined : `${where} fehlt`
  const type = typeof field === 'string' ? (field.replace('?', '') as Scalar) : field
  if (Array.isArray(type)) {
    if (!Array.isArray(value)) return `${where} ist keine Liste`
    for (const [i, item] of value.entries()) {
      const error = checkObject(item, type[0], `${where}[${i}]`, refs)
      if (error) return error
    }
    return undefined
  }
  if (typeof type === 'object') return checkObject(value, type, where, refs)
  switch (type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? undefined : `${where} ist keine Zahl`
    case 'positive':
      return typeof value === 'number' && value > 0 && Number.isFinite(value) ? undefined : `${where} ist keine Zahl größer 0`
    case 'boolean':
      return typeof value === 'boolean' ? undefined : `${where} ist nicht true/false`
    case 'strength':
      return [1, 2, 3, 4, 5].includes(value as number) ? undefined : `${where} ist keine Stärke 1–5`
    case 'color':
      return typeof value === 'string' && COLOR.test(value) ? undefined : `${where} ist keine Farbe #rrggbb`
    case 'timing':
      return checkTiming(value, where, refs)
    case 'id':
    case 'string':
      return typeof value === 'string' && (type === 'string' || value !== '') ? undefined : `${where} ist kein Text`
    default:
      if (typeof value !== 'string') return `${where} ist keine ID`
      refs.push({ kind: type, id: value })
  }
}

function checkTiming(value: unknown, where: string, refs: Ref[]) {
  if (typeof value !== 'object' || value === null) return `${where} ist keine Zeitangabe`
  const t = value as Record<string, unknown>
  if (Object.keys(t).some((k) => !['at', 'from', 'to'].includes(k)) || ('at' in t && ('from' in t || 'to' in t))) return `${where} ist keine Zeitangabe`
  for (const key of ['at', 'from', 'to']) {
    if (key in t && typeof t[key] !== 'string') return `${where}.${key} ist keine ID`
    if (typeof t[key] === 'string') refs.push({ kind: 'timePoint', id: t[key] })
  }
}

function checkObject(value: unknown, spec: Spec, where: string, refs: Ref[]) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return `${where} ist kein Objekt`
  const unknown = Object.keys(value).find((k) => !(k in spec))
  if (unknown) return `${where ? where + '.' : ''}${unknown} ist unbekannt`
  for (const [key, field] of Object.entries(spec)) {
    const error = check((value as Record<string, unknown>)[key], field, where ? `${where}.${key}` : key, refs)
    if (error) return error
  }
}

interface Parsed {
  kind: Kind
  path: string
  item: Record<string, unknown>
  refs: Ref[]
}

const FILE = /^(.+)\/[a-z0-9-]+-([a-z0-9]{4})\.json$/
const TEXT = /^(.+\/[a-z0-9-]+-[a-z0-9]{4})\.(\w+)\.md$/
const IMAGE_FILE = /^images\/[a-z0-9-]+-[a-z0-9]{4}\.\w+$/
const BOOK_FOLDERS = ['images', 'facts', ...KINDS.map((k) => k.folder.split('/')[0])]

/** Buch hat eine neuere Formatversion, als diese App lesen kann */
export class FormatTooNewError extends Error {}

const nestedIds = (item: Record<string, unknown>): unknown[] => {
  const lists = ['phases', 'images'].flatMap((key) => (Array.isArray(item[key]) ? (item[key] as Record<string, unknown>[]) : []))
  const background = item.background as Record<string, unknown> | undefined
  return [item.id, ...(background ? [background.id] : []), ...lists.flatMap(nestedIds)]
}

const ACCEPTS: Record<RefKind, Kind['key'][]> = {
  timePoint: ['timePoints'],
  person: ['persons'],
  group: ['groups'],
  actor: ['persons', 'groups'],
  place: ['places'],
  event: ['events'],
  relationType: ['relationTypes'],
}

/**
 * Liest ein Buch aus Repo-Dateien; fehlerhafte Dateien werden übersprungen und aufgelistet.
 * `others` sind die übrigen Pfade im Repo (z. B. Bilder), die nur auf ihren Namen geprüft werden.
 */
export function filesToBook(files: BookFiles, others: string[] = []): { book: Book; errors: LoadError[] } {
  const errors: LoadError[] = []
  let meta: Record<string, unknown> = {}
  try {
    meta = JSON.parse(files['booktime.json'] ?? 'null') ?? {}
  } catch {
    errors.push({ path: 'booktime.json', reason: 'kein gültiges JSON' })
  }
  if (typeof meta.format === 'number' && meta.format > FORMAT) throw new FormatTooNewError(`Das Buch hat Format ${meta.format}, diese BookTime-Version kennt nur bis ${FORMAT}.`)

  const parsed: Parsed[] = []
  for (const path of [...Object.keys(files), ...others].sort()) {
    const fail = (reason: string) => errors.push({ path, reason })
    const text = files[path]
    const match = FILE.exec(path)
    const kind = match && KINDS.find((k) => k.folder === match[1])
    if (!kind || !match || text === undefined) {
      unknownFile(path, files, fail)
      continue
    }
    let item: Record<string, unknown>
    try {
      item = JSON.parse(text)
    } catch {
      fail('kein gültiges JSON')
      continue
    }
    const refs: Ref[] = []
    const error = checkObject(item, kind.spec, '', refs)
    if (error) fail(error)
    else if (item.id !== match[2]) fail(`id „${item.id}“ passt nicht zum Dateinamen`)
    else parsed.push({ kind, path, item, refs })
  }

  const count = new Map<unknown, number>()
  parsed.flatMap((p) => nestedIds(p.item)).forEach((id) => count.set(id, (count.get(id) ?? 0) + 1))
  let valid = parsed.filter((p) => {
    const twice = nestedIds(p.item).find((id) => count.get(id) !== 1)
    if (twice !== undefined) errors.push({ path: p.path, reason: `ID „${twice}“ kommt mehrfach vor` })
    return twice === undefined
  })
  // Fällt eine Datei weg, können weitere Verweise ins Leere zeigen oder Prüfungen anders ausgehen
  for (let changed = true; changed; ) {
    const kinds = new Map(valid.map((p) => [p.item.id as string, p.kind.key]))
    let next = valid.filter((p) => {
      const missing = p.refs.find((r) => !ACCEPTS[r.kind].includes(kinds.get(r.id)!))
      if (missing) errors.push({ path: p.path, reason: `Verweis auf unbekannte ID „${missing.id}“` })
      return !missing
    })
    if (next.length === valid.length) {
      const failed = new Map(problems(assemble(meta, files, next)).map((p) => [p.id, p.reason]))
      next = next.filter((p) => {
        const reason = failed.get(p.item.id as string)
        if (reason) errors.push({ path: p.path, reason })
        return !reason
      })
    }
    changed = next.length !== valid.length
    valid = next
  }
  return { book: assemble(meta, files, valid), errors }
}

function unknownFile(path: string, files: BookFiles, fail: (reason: string) => void) {
  const folder = path.split('/')[0]!
  if (!path.includes('/') || !BOOK_FOLDERS.includes(folder)) return
  if (folder === 'images') {
    if (!IMAGE_FILE.test(path)) fail('Bildname passt nicht zum Schema <name>-<id>.<endung>')
    return
  }
  const text = TEXT.exec(path)
  const kind = text && KINDS.find((k) => path.startsWith(k.folder + '/') && k.folder === text[1]!.slice(0, text[1]!.lastIndexOf('/')))
  if (!text || !kind) fail('Datei passt zu keinem Element (Ordner oder Name unbekannt)')
  else if (!kind.texts.includes(text[2]!)) fail(`Textfeld „${text[2]}“ gibt es bei ${kind.folder} nicht`)
  else if (files[`${text[1]}.json`] === undefined) fail('Text ohne zugehörige JSON-Datei')
}

function assemble(meta: Record<string, unknown>, files: BookFiles, valid: Parsed[]): Book {
  const book: Book = { title: typeof meta.title === 'string' ? meta.title : 'Ohne Titel', timePoints: [], persons: [], groups: [], places: [], events: [], relationTypes: [], facts: [] }
  const markdown = (path: string) => files[path]?.replace(/\n$/, '')
  if (files['booktime.note.md']) book.note = markdown('booktime.note.md')
  for (const { kind, path, item: parsed } of valid) {
    const item = { ...parsed }
    for (const text of kind.texts) {
      const content = markdown(path.replace(/\.json$/, `.${text}.md`))
      if (content !== undefined) item[text] = content
      else if (text !== 'note') item[text] = ''
    }
    if (isFactKind(kind.key)) book.facts.push({ kind: kind.key, ...item } as unknown as Fact)
    else (book[kind.key] as unknown[]).push(item)
  }
  return book
}

/** Zufällige ID aus 4 Zeichen, die in `taken` noch nicht vorkommt */
function newId(taken: Set<string>) {
  for (;;) {
    const id = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => (b % 36).toString(36)).join('')
    if (!taken.has(id)) return id
  }
}

/** Datei für einen ersten Zeitpunkt „Anfang“, mit dem ein Buch auswertbar wird */
export function firstTimePoint(files: BookFiles): [string, string] {
  const taken = new Set(Object.keys(files).flatMap((path) => /-([a-z0-9]{4})\./.exec(path)?.slice(1) ?? []))
  const id = newId(taken)
  return [`time-points/anfang-${id}.json`, json({ id, name: 'Anfang', order: 1 })]
}
