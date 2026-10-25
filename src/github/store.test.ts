import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkingCopy } from './store'

const copy = (files: Record<string, string>, base = files): WorkingCopy => ({
  repo: 'o/buch',
  login: 'tester',
  branch: 'tester/arbeit',
  defaultBranch: 'main',
  head: 'abc',
  base,
  files,
  images: {},
  commits: [],
  repoSize: 1,
})

// Jeder Test bekommt einen frischen Browser-Speicher und ein frisch geladenes Modul (store.ts merkt sich die offene DB)
const fresh = async () => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.resetModules()
  return import('./store')
}

let store: Awaited<ReturnType<typeof fresh>>

beforeEach(async () => {
  store = await fresh()
})

describe('Arbeitskopie pro Datei', () => {
  it('liest eine gespeicherte Arbeitskopie unverändert zurück', async () => {
    const saved = copy({ 'booktime.json': '{}', 'persons/a-aaaa.json': '{"id":"aaaa"}' }, { 'booktime.json': '{}' })
    await store.copies.put(saved)
    expect(await store.copies.get('o/buch')).toEqual(saved)
  })

  it('schreibt beim erneuten Speichern nur geänderte Dateien und löscht entfernte', async () => {
    await store.copies.put(copy({ 'a.json': '1', 'b.json': '2', 'c.json': '3' }))
    const put = vi.spyOn(IDBObjectStore.prototype, 'put')
    const removed = vi.spyOn(IDBObjectStore.prototype, 'delete')
    await store.copies.put(copy({ 'a.json': '1', 'b.json': '2 geändert' }, { 'a.json': '1', 'b.json': '2', 'c.json': '3' }))
    const filePuts = put.mock.calls.filter(([value]) => typeof value === 'object' && value !== null && 'layer' in value)
    expect(filePuts.map(([value]) => (value as { path: string }).path)).toEqual(['b.json'])
    expect(removed.mock.calls.map(([key]) => key)).toEqual([['o/buch', 'files', 'c.json']])
    expect((await store.copies.get('o/buch'))?.files).toEqual({ 'a.json': '1', 'b.json': '2 geändert' })
  })

  it('löscht eine Arbeitskopie samt Dateien', async () => {
    await store.copies.put(copy({ 'a.json': '1' }))
    await store.copies.delete('o/buch')
    expect(await store.copies.get('o/buch')).toBeUndefined()
  })

  it('übernimmt Arbeitskopien aus Speicherversion 1', async () => {
    const old = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('booktime', 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('copies', { keyPath: 'repo' }).put(copy({ 'a.json': 'neu' }, { 'a.json': 'alt' }))
        request.result.createObjectStore('images')
      }
      request.onsuccess = () => resolve(request.result)
    })
    old.close()
    expect(await store.copies.get('o/buch')).toEqual(copy({ 'a.json': 'neu' }, { 'a.json': 'alt' }))
  })
})

describe('Einstellungen im Browser', () => {
  it('liefert bei kaputter Bücherliste eine leere Liste', () => {
    const storage = new Map<string, string>([['booktime.books', '{kaputt']])
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null })
    expect(store.books.get()).toEqual([])
  })
})
