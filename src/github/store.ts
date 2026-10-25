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
  get: (): string[] => JSON.parse(read(keys.books) ?? '[]'),
  set: (list: string[]) => write(keys.books, JSON.stringify(list)),
}

/** Repo, das die Hauptseite anzeigt; null = Beispielbuch */
export const activeRepo = {
  get: () => read(keys.active),
  set: (repo: string | null) => write(keys.active, repo),
}

let opened: Promise<IDBDatabase> | undefined

const db = () =>
  (opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('booktime', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('copies', { keyPath: 'repo' })
      request.result.createObjectStore('images')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }))

async function run<T>(store: 'copies' | 'images', mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest) {
  const request = action((await db()).transaction(store, mode).objectStore(store))
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Arbeitskopien in IndexedDB */
export const copies = {
  get: (repo: string) => run<WorkingCopy | undefined>('copies', 'readonly', (s) => s.get(repo)),
  put: (copy: WorkingCopy) => run('copies', 'readwrite', (s) => s.put(copy)),
  delete: (repo: string) => run('copies', 'readwrite', (s) => s.delete(repo)),
}

/** Geladene Bilder, nach Repo und Blob-SHA */
export const imageCache = {
  get: (repo: string, sha: string) => run<Blob | undefined>('images', 'readonly', (s) => s.get(`${repo}:${sha}`)),
  put: (repo: string, sha: string, blob: Blob) => run('images', 'readwrite', (s) => s.put(blob, `${repo}:${sha}`)),
}
