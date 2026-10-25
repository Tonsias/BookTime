import { useEffect, useState } from 'react'
import type { Book } from '../model'
import { filesToBook, type LoadError } from '../storage/format'
import { sampleFiles, sampleImages } from '../storage/sample'
import { GitHub } from './api'
import { activeRepo, copies, imageCache, token } from './store'

/** Buch, das die Hauptseite anzeigt, mit Herkunft und Ladefehlern */
export interface ActiveBook {
  book: Book
  errors: LoadError[]
  repo: string | null
  imageUrl: (file: string) => Promise<string | undefined>
}

const TYPES: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }

// GitHub liefert Dateien ohne Typ, ohne ihn lädt der Browser z. B. kein SVG als Bild
const imageType = (file: string) => TYPES[file.split('.').pop()!.toLowerCase()] ?? ''

const sample = (): ActiveBook => ({ ...filesToBook(sampleFiles), repo: null, imageUrl: async (file) => sampleImages[file] })

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
    return blob && URL.createObjectURL(new Blob([blob], { type: imageType(file) }))
  }
  return {
    ...filesToBook(copy.files),
    repo,
    imageUrl: (file) => {
      if (!urls.has(file)) urls.set(file, imageUrl(file).catch(() => undefined))
      return urls.get(file)!
    },
  }
}

/** Lädt das aktive Buch aus der Arbeitskopie, sonst das Beispielbuch */
export function useActiveBook() {
  const [active, setActive] = useState<ActiveBook>()
  useEffect(() => {
    loadActive()
      .catch((error: Error) => ({ ...sample(), errors: [{ path: activeRepo.get() ?? '', reason: error.message }] }))
      .then(setActive)
  }, [])
  return active
}
