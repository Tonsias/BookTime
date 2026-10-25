// Prüft das Beispielbuch in beispiel/ mit derselben Prüfung wie beim Laden und ob es unverändert zurückgeschrieben wird.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { bookToFiles, filesToBook } from '../src/storage/format.ts'

const root = 'beispiel'
const files = {}
for (const path of readdirSync(root, { recursive: true })) {
  if (statSync(join(root, path)).isFile()) files[path.replaceAll('\\', '/')] = readFileSync(join(root, path), 'utf8')
}

const { book, errors } = filesToBook(files)
const written = bookToFiles(book)
const drift = [...new Set([...Object.keys(files), ...Object.keys(written)])].filter((path) => files[path] !== written[path])

for (const { path, reason } of errors) console.error(`Fehler: ${path}: ${reason}`)
for (const path of drift) console.error(`Abweichung beim Zurückschreiben: ${path}`)
if (errors.length || drift.length) process.exit(1)
console.log(`Beispielbuch ok: ${Object.keys(files).length} Dateien`)
