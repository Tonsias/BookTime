import { describe, expect, it } from 'vitest'
import { parseAddress, splitAddress } from './address'

describe('Buch-Adressen', () => {
  it('nimmt owner/repo und owner/repo/pfad an', () => {
    expect(parseAddress(' o/buch ')).toEqual({ address: 'o/buch' })
    expect(parseAddress('o/projekt/docs/story/')).toEqual({ address: 'o/projekt/docs/story' })
    expect(parseAddress('https://github.com/o/buch')).toEqual({ address: 'o/buch' })
  })

  it('lehnt Ungültiges und Links mit Branch ab', () => {
    expect(parseAddress('o')).toEqual({ error: '' })
    expect(parseAddress('o/buch/../x')).toEqual({ error: '' })
    expect(parseAddress('https://github.com/o/buch/tree/main/story')).toEqual({ error: 'Bitte als owner/repo/ordner angeben.' })
  })

  it('trennt Repo und Pfad', () => {
    expect(splitAddress('o/buch')).toEqual({ repo: 'o/buch', path: '' })
    expect(splitAddress('o/projekt/docs/story')).toEqual({ repo: 'o/projekt', path: 'docs/story' })
  })
})
