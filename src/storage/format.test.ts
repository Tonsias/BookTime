import { describe, expect, it } from 'vitest'
import { bookToFiles, filesToBook, firstTimePoint, FormatTooNewError, type BookFiles } from './format'
import { sampleFiles } from './sample'

const json = (value: object) => JSON.stringify(value, null, 2) + '\n'
const minimal: BookFiles = {
  'booktime.json': json({ format: 1, title: 'Test' }),
  'time-points/anfang-aaaa.json': json({ id: 'aaaa', name: 'Anfang', order: 1 }),
  'places/hof-bbbb.json': json({ id: 'bbbb', name: 'Hof', color: '#112233', existence: {}, images: [], phases: [{ id: 'cccc', timing: {}, x: 0, y: 0, images: [] }] }),
  'persons/pia-dddd.json': json({ id: 'dddd', name: 'Pia', color: '#445566', existence: {}, images: [] }),
  'facts/stays/pia-hof-eeee.json': json({ id: 'eeee', person: 'dddd', place: 'bbbb', timing: {} }),
}
const load = (changes: Record<string, string | undefined>, others: string[] = []) => {
  const files = { ...minimal, ...changes }
  for (const [path, text] of Object.entries(changes)) if (text === undefined) delete files[path]
  return filesToBook(files as BookFiles, others)
}
const reasons = (changes: Record<string, string | undefined>, others: string[] = []) => load(changes, others).errors.map((e) => `${e.path}: ${e.reason}`)

describe('Hin- und Rückweg', () => {
  it('schreibt das Beispielbuch unverändert zurück', () => {
    const { book, errors } = filesToBook(sampleFiles)
    expect(errors).toEqual([])
    expect(bookToFiles(book)).toEqual(sampleFiles)
  })

  it('liest Texte aus den Markdown-Dateien daneben', () => {
    const { book } = load({ 'persons/pia-dddd.description.md': 'Gärtnerin\n', 'persons/pia-dddd.note.md': 'mag Rosen\n' })
    expect(book.persons[0]).toMatchObject({ description: 'Gärtnerin', note: 'mag Rosen' })
  })

  it('legt einen ersten Zeitpunkt mit neuer ID an', () => {
    const [path, content] = firstTimePoint(minimal)
    const { book, errors } = load({ 'time-points/anfang-aaaa.json': undefined, [path]: content })
    expect(errors).toEqual([])
    expect(book.timePoints.map((t) => t.name)).toEqual(['Anfang'])
  })
})

describe('Ladefehler', () => {
  it('überspringt kaputtes JSON, fehlende Felder und falsche IDs', () => {
    expect(reasons({ 'persons/pia-dddd.json': '{' })).toContain('persons/pia-dddd.json: kein gültiges JSON')
    expect(reasons({ 'persons/pia-dddd.json': json({ id: 'dddd', color: '#445566', existence: {}, images: [] }) })).toContain('persons/pia-dddd.json: name fehlt')
    expect(reasons({ 'persons/pia-dddd.json': json({ id: 'zzzz', name: 'Pia', color: '#445566', existence: {}, images: [] }) })[0]).toMatch(/passt nicht zum Dateinamen/)
  })

  it('lässt abhängige Fakten mit wegfallen', () => {
    expect(reasons({ 'persons/pia-dddd.json': '{' })).toContain('facts/stays/pia-hof-eeee.json: Verweis auf unbekannte ID „dddd“')
  })

  it('verlangt eindeutige IDs auch in Phasen und Bildern', () => {
    const person = json({ id: 'dddd', name: 'Pia', color: '#445566', existence: {}, images: [{ id: 'cccc', file: 'images/pia-cccc.svg', order: 0 }] })
    expect(reasons({ 'persons/pia-dddd.json': person })).toEqual([
      'persons/pia-dddd.json: ID „cccc“ kommt mehrfach vor',
      'places/hof-bbbb.json: ID „cccc“ kommt mehrfach vor',
      'facts/stays/pia-hof-eeee.json: Verweis auf unbekannte ID „dddd“',
    ])
  })

  it('verbietet Zeitangaben, die vor ihrem Beginn enden', () => {
    const files = {
      'time-points/ende-ffff.json': json({ id: 'ffff', name: 'Ende', order: 2 }),
      'facts/stays/pia-hof-eeee.json': json({ id: 'eeee', person: 'dddd', place: 'bbbb', timing: { from: 'ffff', to: 'aaaa' } }),
    }
    expect(reasons(files)).toEqual(['facts/stays/pia-hof-eeee.json: Zeitangabe endet vor ihrem Beginn'])
  })

  it('meldet unbekannte Dateien in Buch-Ordnern, erlaubt übliche Repo-Dateien', () => {
    expect(reasons({ 'persons/pia.json': '{}', 'README.md': '# Buch\n', 'notizen/idee.md': 'x' })).toEqual(['persons/pia.json: Datei passt zu keinem Element (Ordner oder Name unbekannt)'])
    expect(reasons({ 'persons/pia-dddd.result.md': 'x' })).toEqual(['persons/pia-dddd.result.md: Textfeld „result“ gibt es bei persons nicht'])
    expect(reasons({ 'persons/max-gggg.note.md': 'x' })).toEqual(['persons/max-gggg.note.md: Text ohne zugehörige JSON-Datei'])
    expect(reasons({}, ['images/Foto.png', 'images/pia-hhhh.png', '.github/x.yml'])).toEqual(['images/Foto.png: Bildname passt nicht zum Schema <name>-<id>.<endung>'])
  })

  it('bricht bei einer neueren Formatversion ab', () => {
    expect(() => load({ 'booktime.json': json({ format: 99, title: 'Neu' }) })).toThrow(FormatTooNewError)
  })
})

describe('Gewollte Hinweise', () => {
  const accepted = (list: unknown) => ({ 'accepted-hints.json': json({ accepted: list }) })

  it('liest und schreibt die Datei, ohne Notiz ohne Feld', () => {
    const entries = [{ rule: 'outside-existence', ids: ['eeee', 'dddd'], note: 'gewollt' }, { rule: 'clash', ids: ['eeee'] }]
    const { book, errors } = load(accepted(entries))
    expect(errors).toEqual([])
    expect(book.acceptedHints).toEqual(entries)
    expect(bookToFiles(book)['accepted-hints.json']).toBe(json({ accepted: entries }))
  })

  it('lässt Einträge mit unbekannten IDs still weg', () => {
    const { book, errors } = load(accepted([{ rule: 'clash', ids: ['eeee', 'zzzz'] }]))
    expect(errors).toEqual([])
    expect(book.acceptedHints).toEqual([])
    expect(bookToFiles(book)['accepted-hints.json']).toBeUndefined()
  })

  it('meldet eine kaputte Datei, ohne das Buch zu blockieren', () => {
    expect(reasons({ 'accepted-hints.json': '{' })).toEqual(['accepted-hints.json: kein gültiges JSON'])
    expect(reasons({ 'accepted-hints.json': json({ accepted: 1 }) })).toEqual(['accepted-hints.json: accepted ist keine Liste'])
  })
})

describe('Kalender und Daten', () => {
  const calendar = { months: [{ name: 'Frostmond', days: 30 }], weekdays: ['Erdtag', 'Ruhetag'], firstWeekday: 1, before: { name: 'davor', short: 'v.' }, eras: [{ name: 'Erste', short: 'E.' }] }
  const dated = {
    'calendar.json': json(calendar),
    'time-points/anfang-aaaa.json': json({ id: 'aaaa', name: 'Anfang', dateLabel: 'Frühling', date: { era: 1, year: 412, month: 1, day: 3 }, order: 1 }),
    'persons/pia-dddd.json': json({ id: 'dddd', name: 'Pia', born: { era: 0, year: 2 }, color: '#445566', existence: {}, images: [] }),
  }

  it('liest und schreibt Kalender, Datum und Geburtsdatum unverändert', () => {
    const { book, errors } = load(dated)
    expect(errors).toEqual([])
    expect(book.calendar).toEqual(calendar)
    expect(book.persons[0]!.born).toEqual({ era: 0, year: 2 })
    expect(bookToFiles(book)).toEqual({ ...minimal, ...dated })
  })

  it('meldet einen falsch aufgebauten Kalender und lädt das Buch ohne ihn', () => {
    expect(reasons({ 'calendar.json': json({ eras: [{ name: 'Erste', short: 'E.' }] }) })).toEqual(['calendar.json: before fehlt'])
    expect(reasons({ 'calendar.json': json({ months: [{ name: 'X', days: 0 }] }) })).toEqual(['calendar.json: months[0].days ist keine ganze Zahl ab 1'])
    expect(load({ 'calendar.json': json({ weekdays: ['A'], firstWeekday: 2 }) }).book.calendar).toBeUndefined()
  })
})
