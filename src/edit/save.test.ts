import { describe, expect, it } from 'vitest'
import type { WorkingCopy } from '../github/store'
import { bookToFiles, filesToBook } from '../storage/format'
import { sampleFiles } from '../storage/sample'
import { addImage, produce, type Recipe } from './ops'
import { gitBlobSha, saveBook } from './save'

const book = filesToBook(sampleFiles).book
const copy = (files = bookToFiles(book), images: WorkingCopy['images'] = {}): WorkingCopy => ({
  repo: 'o/buch',
  login: '',
  branch: '',
  defaultBranch: '',
  head: '',
  base: files,
  files,
  images,
  commits: [],
  repoSize: 0,
})
const after = (recipe: Recipe) => {
  const result = produce(book, recipe)
  if (!result || 'blocked' in result) throw new Error('abgebrochen')
  return result.book
}
const anna = book.persons.find((p) => p.name === 'Anna')!

describe('Speichern als Unterschied', () => {
  it('schreibt nur geänderte Dateien und benennt bei neuem Namen um', () => {
    const next = after((d) => void (d.persons.find((p) => p.id === anna.id)!.name = 'Anja'))
    const saved = saveBook(copy(), book, next, new Map())
    const changed = Object.keys(saved.files).filter((p) => saved.files[p] !== sampleFiles[p])
    expect(changed.some((p) => p.startsWith(`persons/anja-${anna.id}`))).toBe(true)
    expect(Object.keys(saved.files).some((p) => p.startsWith(`persons/anna-${anna.id}`))).toBe(false)
    expect(saved.files['booktime.json']).toBe(sampleFiles['booktime.json'])
  })

  it('lässt Dateien stehen, die beim Laden fehlerhaft waren', () => {
    const broken = { ...bookToFiles(book), 'persons/kaputt-zzzz.json': '{' }
    const saved = saveBook(copy(broken), book, after((d) => void (d.title = 'Neu')), new Map())
    expect(saved.files['persons/kaputt-zzzz.json']).toBe('{')
  })

  it('nimmt hochgeladene Bilder auf und entfernt verwaiste wieder', () => {
    const upload = new Map([['images/anna-iiii.png', { sha: 'abc', size: 10 }]])
    const withImage = after((d) => void addImage(d, anna.id, 'images/anna-iiii.png'))
    const added = saveBook(copy(), book, withImage, upload)
    expect(added.imageChanges).toEqual({ 'images/anna-iiii.png': { sha: 'abc', size: 10 } })
    expect(saveBook(added, withImage, book, upload).imageChanges).toEqual({})
  })

  it('löscht ein Bild aus dem Repo erst, wenn nichts mehr darauf verweist', () => {
    const file = book.timePoints.find((t) => t.background)!.background!.file
    const repoImages = { [file]: { sha: 'x', size: 1 } }
    const without = after((d) => d.timePoints.forEach((t) => delete t.background))
    const removed = saveBook(copy(undefined, repoImages), book, without, new Map())
    expect(removed.imageChanges).toEqual({ [file]: null })
    expect(saveBook(removed, without, book, new Map()).imageChanges).toEqual({})
  })
})

it('berechnet den Git-Blob-SHA wie git hash-object', async () => {
  expect(await gitBlobSha(new Blob(['hello\n']))).toBe('ce013625030ba8dba906f756967f9e9ca394464a')
})
