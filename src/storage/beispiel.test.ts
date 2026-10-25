import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { hints } from '../checks'
import { bookToFiles, filesToBook } from './format'

const root = 'beispiel'
const files: Record<string, string> = {}
const others: string[] = []
for (const entry of readdirSync(root, { recursive: true }) as string[]) {
  if (!statSync(join(root, entry)).isFile()) continue
  const path = entry.replaceAll('\\', '/')
  if (/\.(json|md)$/.test(path)) files[path] = readFileSync(join(root, entry), 'utf8')
  else others.push(path)
}
const { book, errors } = filesToBook(files, others)

it('Beispielbuch lädt ohne Fehler und Hinweise', () => {
  expect(errors).toEqual([])
  expect(hints(book, others)).toEqual([])
})

it('Beispielbuch wird unverändert zurückgeschrieben', () => {
  expect(bookToFiles(book)).toEqual(files)
})

it('Beispielbuch nutzt genau die vorhandenen Bilder', () => {
  const elements = [...book.persons, ...book.groups, ...book.places, ...book.events]
  const images = [...elements.flatMap((e) => e.images), ...book.places.flatMap((p) => p.phases.flatMap((phase) => phase.images))]
  const backgrounds = book.timePoints.flatMap((t) => (t.background ? [t.background] : []))
  expect([...images, ...backgrounds].map((i) => i.file).sort()).toEqual(others.sort())
})
