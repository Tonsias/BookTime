import { useEffect, useState } from 'react'
import type { Book } from '../model'
import { filesToBook, firstTimePoint, type LoadError } from './format'
import { sampleFiles, sampleImages } from './sample'
import { GitHub } from '../github/api'
import { activeRepo, copies, imageCache, token, type WorkingCopy } from '../github/store'
import { currentImages } from '../github/sync'

/** Schlüssel der lokalen Arbeitskopie des Beispielbuchs (Festlegung 55 des Editors) */
const SAMPLE = 'beispiel'

/** Buch, das die Hauptseite anzeigt, mit Arbeitskopie und Ladefehlern */
export interface ActiveBook {
  book: Book
  errors: LoadError[]
  repo: string | null
  copy: WorkingCopy
}

const TYPES: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }

// GitHub liefert Dateien ohne Typ, ohne ihn lädt der Browser z. B. kein SVG als Bild
const imageType = (file: string) => TYPES[file.split('.').pop()!.toLowerCase()] ?? ''

/** Unveränderte Arbeitskopie des Beispielbuchs */
const sampleCopy = (): WorkingCopy => ({
  repo: SAMPLE,
  login: '',
  branch: '',
  defaultBranch: '',
  head: '',
  base: sampleFiles,
  files: sampleFiles,
  images: Object.fromEntries(Object.keys(sampleImages).map((path) => [path, { sha: '', size: 0 }])),
  commits: [],
  repoSize: 0,
})

const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b)

// Eine neue Beispiel-Version wird nur übernommen, solange niemand das Beispiel geändert hat
async function storedSample() {
  const stored = await copies.get(SAMPLE).catch(() => undefined)
  const untouched = stored && same(stored.files, stored.base) && !Object.keys(stored.imageChanges ?? {}).length
  if (stored && (!untouched || same(stored.base, sampleFiles))) return stored
  const fresh = sampleCopy()
  await copies.put(fresh).catch(() => undefined)
  return fresh
}

const latestCopies = new Map<string, WorkingCopy>()

/** Merkt sich den neuesten Stand einer Arbeitskopie für die Bildadressen */
export const rememberCopy = (copy: WorkingCopy) => void latestCopies.set(copy.repo, copy)

/** Adresse eines Bildes der jeweils neuesten Arbeitskopie; neue Bilder kommen aus dem Browser-Speicher */
export function imageUrls(repo: string) {
  const latest = () => latestCopies.get(repo)!
  const urls = new Map<string, Promise<string | undefined>>()
  const resolve = async (file: string) => {
    const copy = latest()
    const ref = currentImages(copy)[file]
    if (!ref) return undefined
    if (copy.repo === SAMPLE && !ref.sha) return sampleImages[file]
    let blob = await imageCache.get(copy.repo, ref.sha)
    const key = token.get()
    if (!blob && key && copy.repo !== SAMPLE) {
      blob = await new GitHub(key, copy.repo).blob(ref.sha)
      await imageCache.put(copy.repo, ref.sha, blob)
    }
    if (!blob) return undefined
    const url = URL.createObjectURL(new Blob([blob], { type: imageType(file) }))
    addEventListener('pagehide', () => URL.revokeObjectURL(url), { once: true })
    return url
  }
  return (file: string) => {
    const sha = currentImages(latest())[file]?.sha
    const key = `${file}|${sha}`
    if (!urls.has(key)) urls.set(key, resolve(file).catch(() => undefined))
    return urls.get(key)!
  }
}

async function loadActive(): Promise<ActiveBook> {
  const repo = activeRepo.get()
  const stored = repo ? await copies.get(repo) : undefined
  const copy = stored ?? (await storedSample())
  rememberCopy(copy)
  return { ...filesToBook(copy.files, Object.keys(currentImages(copy))), repo: stored ? repo : null, copy }
}

/** Lädt das aktive Buch aus der Arbeitskopie, sonst das Beispielbuch; liefert beim Scheitern den Fehler */
export function useActiveBook() {
  const [active, setActive] = useState<ActiveBook | Error>()
  useEffect(() => {
    loadActive().then(setActive, setActive)
  }, [])
  return active
}

/** Legt in der Arbeitskopie des aktiven Repos einen ersten Zeitpunkt an */
export async function addFirstTimePoint(repo: string) {
  const copy = await copies.get(repo)
  if (!copy) return
  const [path, content] = firstTimePoint(copy.files)
  await copies.put({ ...copy, files: { ...copy.files, [path]: content } })
}
