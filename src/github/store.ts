import type { BookFiles } from '../storage/format'

/** Lokaler Commit, der noch nicht gepusht ist; null löscht eine Datei */
interface LocalCommit {
  message: string
  changes: Record<string, string | null>
}

/** Arbeitskopie eines Buch-Repos im Browser */
export interface WorkingCopy {
  repo: string
  login: string
  branch: string
  defaultBranch: string
  /** Commit auf GitHub, auf dem die Arbeitskopie aufsetzt */
  head: string
  base: BookFiles
  images: Record<string, { sha: string; size: number }>
  files: BookFiles
  commits: LocalCommit[]
  repoSize: number
  pullUrl?: string
  pushing?: { branch: string; head: string }
}

const keys = { token: 'booktime.token', books: 'booktime.books', active: 'booktime.active' }

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Ohne Speicher gilt die Einstellung nur bis zum Neuladen
  }
}

/** Gemerktes GitHub-Token */
export const token = {
  get: () => read(keys.token),
  set: (value: string | null) => write(keys.token, value),
}

/** Gemerkte Buch-Repos (`owner/repo`) */
export const books = {
  get: (): string[] => {
    try {
      const list: unknown = JSON.parse(read(keys.books) ?? '[]')
      return Array.isArray(list) ? list.filter((r): r is string => typeof r === 'string') : []
    } catch {
      return []
    }
  },
  set: (list: string[]) => write(keys.books, JSON.stringify(list)),
}

/** Repo, das die Hauptseite anzeigt; null = Beispielbuch */
export const activeRepo = {
  get: () => read(keys.active),
  set: (repo: string | null) => write(keys.active, repo),
}

let opened: Promise<IDBDatabase> | undefined

type Layer = 'base' | 'files'
type FileRecord = { repo: string; layer: Layer; path: string; text: string }
type Meta = Omit<WorkingCopy, Layer>

const db = () =>
  (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('booktime', 2)
    request.onupgradeneeded = (event) => {
      const database = request.result
      if (event.oldVersion < 1) {
        database.createObjectStore('copies', { keyPath: 'repo' })
        database.createObjectStore('images')
      }
      const files = database.createObjectStore('files', { keyPath: ['repo', 'layer', 'path'] })
      files.createIndex('repo', 'repo')
      const old = request.transaction!.objectStore('copies')
      old.openCursor().onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result
        if (!cursor) return
        const { base, files: work, ...meta } = cursor.value as WorkingCopy
        for (const [layer, list] of [['base', base], ['files', work]] as const)
          for (const [path, text] of Object.entries(list ?? {})) files.put({ repo: meta.repo, layer, path, text } satisfies FileRecord)
        cursor.update(meta)
        cursor.continue()
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Der Browser-Speicher ist von einem anderen BookTime-Tab blockiert. Andere Tabs schließen und neu laden.'))
  }).catch((error: unknown) => {
    opened = undefined
    throw error
  }))

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

async function transaction<T>(stores: string[], mode: IDBTransactionMode, action: (tx: IDBTransaction) => Promise<T>) {
  const tx = (await db()).transaction(stores, mode)
  const finished = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = tx.onabort = () => reject(tx.error)
  })
  const result = await action(tx)
  await finished
  return result
}

const records = (tx: IDBTransaction, repo: string) => done<FileRecord[]>(tx.objectStore('files').index('repo').getAll(repo))

/** Arbeitskopien in IndexedDB; Dateien werden einzeln gespeichert und nur bei Änderung geschrieben */
export const copies = {
  get: (repo: string) =>
    transaction(['copies', 'files'], 'readonly', async (tx): Promise<WorkingCopy | undefined> => {
      const meta = await done<Meta | undefined>(tx.objectStore('copies').get(repo))
      if (!meta) return undefined
      const copy: WorkingCopy = { ...meta, base: {}, files: {} }
      for (const { layer, path, text } of await records(tx, repo)) copy[layer][path] = text
      return copy
    }),
  put: (copy: WorkingCopy) =>
    transaction(['copies', 'files'], 'readwrite', async (tx) => {
      const { base, files, ...meta } = copy
      const store = tx.objectStore('files')
      tx.objectStore('copies').put(meta)
      const stored = new Map((await records(tx, copy.repo)).map((r) => [`${r.layer}/${r.path}`, r]))
      for (const [layer, list] of [['base', base], ['files', files]] as const) {
        for (const [path, text] of Object.entries(list)) {
          if (stored.get(`${layer}/${path}`)?.text !== text) store.put({ repo: copy.repo, layer, path, text } satisfies FileRecord)
          stored.delete(`${layer}/${path}`)
        }
      }
      for (const { layer, path } of stored.values()) store.delete([copy.repo, layer, path])
    }),
  delete: (repo: string) =>
    transaction(['copies', 'files'], 'readwrite', async (tx) => {
      tx.objectStore('copies').delete(repo)
      for (const { layer, path } of await records(tx, repo)) tx.objectStore('files').delete([repo, layer, path])
    }),
}

const run = async <T>(mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>) => transaction(['images'], mode, (tx) => done(action(tx.objectStore('images'))))

/** Geladene Bilder, nach Repo und Blob-SHA */
export const imageCache = {
  get: (repo: string, sha: string) => run<Blob | undefined>('readonly', (s) => s.get(`${repo}:${sha}`)),
  put: (repo: string, sha: string, blob: Blob) => run('readwrite', (s) => s.put(blob, `${repo}:${sha}`)),
}
