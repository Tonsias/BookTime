import type { ImageRef, WorkingCopy } from '../github/store'
import { committedImages } from '../github/sync'
import type { Book } from '../model'
import { bookToFiles } from '../storage/format'
import { imageFiles } from './ops'

/**
 * Arbeitskopie nach einer Änderung des Buchs (Festlegung 54 des Editors): nur geänderte Dateien werden geschrieben,
 * Dateien, die beim Laden fehlerhaft waren, bleiben stehen. Bilder ohne Verweis werden entfernt, neue aus `uploads` ergänzt.
 */
export function saveBook(copy: WorkingCopy, before: Book, after: Book, uploads: ReadonlyMap<string, ImageRef>): WorkingCopy {
  const [old, now] = [bookToFiles(before), bookToFiles(after)]
  const files = { ...copy.files }
  for (const path of Object.keys(old)) if (!(path in now)) delete files[path]
  for (const [path, text] of Object.entries(now)) if (old[path] !== text) files[path] = text

  const imageChanges = { ...copy.imageChanges }
  const [was, is] = [imageFiles(before), imageFiles(after)]
  const committed = committedImages(copy)
  for (const path of was) {
    if (is.has(path)) continue
    if (committed[path]) imageChanges[path] = null
    else delete imageChanges[path]
  }
  for (const path of is) {
    if (was.has(path)) continue
    const upload = uploads.get(path)
    if (committed[path]?.sha === upload?.sha || (!upload && imageChanges[path] === null)) delete imageChanges[path]
    else if (upload) imageChanges[path] = upload
  }
  return { ...copy, files, imageChanges }
}

/** SHA, unter dem git eine Datei als Blob speichert: SHA-1 über „blob <Größe>\0“ und den Inhalt */
export async function gitBlobSha(data: Blob) {
  const bytes = new Uint8Array(await data.arrayBuffer())
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`)
  const all = new Uint8Array(header.length + bytes.length)
  all.set(header)
  all.set(bytes, header.length)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', all))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}
