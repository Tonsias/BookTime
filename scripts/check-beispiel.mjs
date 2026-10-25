// Prüft das Beispielbuch in beispiel/: lädt ohne Fehler, wird unverändert zurückgeschrieben, alle Bilder sind vorhanden.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { bookToFiles, filesToBook } from '../src/storage/format.ts'

const root = 'beispiel'
const files = {}
const other = new Set()
for (const path of readdirSync(root, { recursive: true })) {
  if (!statSync(join(root, path)).isFile()) continue
  const key = path.replaceAll('\\', '/')
  if (/\.(json|md)$/.test(key)) files[key] = readFileSync(join(root, path), 'utf8')
  else other.add(key)
}

const { book, errors } = filesToBook(files)
const written = bookToFiles(book)
const drift = [...new Set([...Object.keys(files), ...Object.keys(written)])].filter((path) => files[path] !== written[path])
const images = [book.persons, book.groups, book.places, book.events].flat().flatMap((e) => [...e.images, ...(e.phases?.flatMap((p) => p.images) ?? [])])
const referenced = [...images, ...book.timePoints.flatMap((t) => (t.background ? [t.background] : []))].map((i) => i.file)
const missing = referenced.filter((file) => !other.has(file))
const unused = [...other].filter((file) => !referenced.includes(file))

for (const { path, reason } of errors) console.error(`Fehler: ${path}: ${reason}`)
for (const path of drift) console.error(`Abweichung beim Zurückschreiben: ${path}`)
for (const path of missing) console.error(`Bild fehlt: ${path}`)
for (const path of unused) console.error(`Bild wird nicht verwendet: ${path}`)
if (errors.length || drift.length || missing.length || unused.length) process.exit(1)
console.log(`Beispielbuch ok: ${Object.keys(files).length} Dateien, ${other.size} Bilder`)
