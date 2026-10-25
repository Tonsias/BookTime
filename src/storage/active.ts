import { useEffect, useState } from 'react'
import type { Book } from '../model'
import { filesToBook, firstTimePoint, type LoadError } from './format'
import { sampleFiles, sampleImages } from './sample'
import { GitHub } from '../github/api'
import { activeRepo, copies, imageCache, token } from '../github/store'

/** Buch, das die Hauptseite anzeigt, mit Herkunft und Ladefehlern */
export interface ActiveBook {
  book: Book
  errors: LoadError[]
  repo: string | null
  images: string[]
  imageUrl: (file: string) => Promise<string | undefined>
}

const TYPES: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }

// GitHub liefert Dateien ohne Typ, ohne ihn lädt der Browser z. B. kein SVG als Bild
const imageType = (file: string) => TYPES[file.split('.').pop()!.toLowerCase()] ?? ''

const sample = (): ActiveBook => ({ ...filesToBook(sampleFiles, Object.keys(sampleImages)), repo: null, images: Object.keys(sampleImages), imageUrl: async (file) => sampleImages[file] })

async function loadActive(): Promise<ActiveBook> {
  const repo = activeRepo.get()
  const copy = repo ? await copies.get(repo) : undefined
  if (!repo || !copy) return sample()
  const urls = new Map<string, Promise<string | undefined>>()
  const imageUrl = async (file: string) => {
    const image = copy.images[file]
    if (!image) return undefined
    let blob = await imageCache.get(repo, image.sha)
    const key = token.get()
    if (!blob && key) {
      blob = await new GitHub(key, repo).blob(image.sha)
      await imageCache.put(repo, image.sha, blob)
    }
    if (!blob) return undefined
    const url = URL.createObjectURL(new Blob([blob], { type: imageType(file) }))
    addEventListener('pagehide', () => URL.revokeObjectURL(url), { once: true })
    return url
  }
  return {
    ...filesToBook(copy.files, Object.keys(copy.images)),
    repo,
    images: Object.keys(copy.images),
    imageUrl: (file) => {
      if (!urls.has(file)) urls.set(file, imageUrl(file).catch(() => undefined))
      return urls.get(file)!
    },
  }
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
