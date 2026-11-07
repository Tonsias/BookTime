import { describe, expect, it } from 'vitest'
import { age, compareDates, fitDate, formatDate, NO_CALENDAR, untilNextEra } from './calendar'
import { hints, problems } from './checks'
import { addEra, dateUses, moveCalendarEntry, removeCalendarEntry } from './edit/ops'
import type { Book, BookDate, Calendar } from './model'

const cal: Calendar = {
  months: [
    { name: 'Frostmond', days: 30 },
    { name: 'Saatmond', days: 31 },
    { name: 'Nebelmond', days: 29 },
  ],
  weekdays: ['Erdtag', 'Wassertag', 'Feuertag'],
  firstWeekday: 1,
  before: { name: 'vor dem Ersten Zeitalter', short: 'v. E.' },
  eras: [
    { name: 'Erstes Zeitalter', short: 'E.', years: 590 },
    { name: 'Zweites Zeitalter', short: 'Z.' },
  ],
}

const book = (dates: (BookDate | undefined)[], born?: BookDate, calendar: Calendar | undefined = cal): Book => ({
  title: 'Test',
  ...(calendar && { calendar }),
  acceptedHints: [],
  timePoints: dates.map((date, k) => ({ id: `t${k}`, name: `T${k}`, order: k + 1, ...(date && { date }) })),
  persons: [{ id: 'p', name: 'Pia', color: '#000000', description: '', existence: {}, images: [], ...(born && { born }) }],
  groups: [],
  places: [],
  events: [],
  relationTypes: [],
  facts: [],
})

describe('Rechnen im Kalender', () => {
  it('zeigt Datum mit Wochentag, auch ohne Monat und ohne Kalender', () => {
    expect(formatDate(cal, { era: 1, year: 1, month: 1, day: 1 })).toBe('Wassertag, 1. Frostmond 1 E.')
    expect(formatDate(cal, { era: 1, year: 1, month: 1, day: 2 })).toBe('Feuertag, 2. Frostmond 1 E.')
    expect(formatDate(cal, { era: 1, year: 2, month: 1, day: 1 })).toBe('Wassertag, 1. Frostmond 2 E.')
    expect(formatDate(cal, { era: 0, year: 1, month: 3, day: 29 })).toBe('Erdtag, 29. Nebelmond 1 v. E.')
    expect(formatDate(cal, { era: 2, year: 412, month: 2 })).toBe('Saatmond 412 Z.')
    expect(formatDate(NO_CALENDAR, { year: -12 })).toBe('-12')
  })

  it('vergleicht in der gemeinsamen Genauigkeit über Zeitrechnungen hinweg', () => {
    expect(compareDates(cal, { era: 1, year: 590 }, { era: 2, year: 1 })).toBeLessThan(0)
    expect(compareDates(cal, { era: 0, year: 3 }, { era: 0, year: 1 })).toBeLessThan(0)
    expect(compareDates(cal, { era: 2, year: 5, month: 2 }, { era: 2, year: 5 })).toBe(0)
  })

  it('rechnet das Alter genau oder mit „ca.“', () => {
    expect(age(cal, { era: 1, year: 580, month: 2, day: 10 }, { era: 2, year: 12, month: 2, day: 9 })).toBe('21 Jahre')
    expect(age(cal, { era: 1, year: 580, month: 2, day: 10 }, { era: 2, year: 12, month: 2, day: 10 })).toBe('22 Jahre')
    expect(age(cal, { era: 2, year: 5 }, { era: 2, year: 6, month: 1, day: 1 })).toBe('ca. 1 Jahr')
    expect(age(cal, { era: 2, year: 5 }, { era: 2, year: 4 })).toBe('noch nicht geboren')
  })

  it('nennt den Abstand zur nächsten Zeitrechnung', () => {
    expect(untilNextEra(cal, { era: 1, year: 412 })).toBe('179 Jahre vor Beginn von „Zweites Zeitalter“')
    expect(untilNextEra(cal, { era: 0, year: 1 })).toBe('1 Jahr vor Beginn von „Erstes Zeitalter“')
    expect(untilNextEra(cal, { era: 2, year: 3 })).toBeUndefined()
  })

  it('rückt ein Datum in die Grenzen des Kalenders', () => {
    expect(fitDate(cal, { era: 1, year: 700, month: 3, day: 31 })).toEqual({ era: 1, year: 590, month: 3, day: 29 })
    expect(fitDate(cal, { year: 0, month: 9 })).toEqual({ era: 0, year: 1, month: 3 })
    expect(fitDate(NO_CALENDAR, { era: 2, year: 4, month: 1, day: 1 })).toEqual({ year: 4 })
  })
})

describe('Prüfungen', () => {
  it('weist auf Daten gegen die Reihenfolge und auf unpassende Daten hin', () => {
    const found = hints(book([{ era: 2, year: 413 }, { era: 2, year: 412, month: 6 }, { era: 2, year: 413, month: 1 }], { era: 3, year: 1 }))
    expect(found.map((h) => [h.rule, h.ids])).toEqual([
      ['date-calendar', ['p']],
      ['date-order', ['t1', 't0']],
      ['date-calendar', ['t1']],
    ])
  })

  it('verbietet Tag ohne Monat und Jahre kleiner 1 in einer Zeitrechnung', () => {
    expect(problems(book([{ year: 3, day: 2 }, { era: 1, year: 0 }])).map((p) => p.id)).toEqual(['t0', 't1'])
  })
})

describe('Kalender ändern', () => {
  it('passt beim Verschieben alle Daten an und hält nur die letzte Zeitrechnung offen', () => {
    const b = book([{ era: 2, year: 30, month: 1 }], { era: 1, year: 4, month: 3 })
    moveCalendarEntry(b, 'month', 0, 2)
    expect(b.timePoints[0]!.date!.month).toBe(3)
    expect(b.persons[0]!.born!.month).toBe(2)
    moveCalendarEntry(b, 'era', 1, 0)
    expect(b.calendar!.eras).toEqual([
      { name: 'Zweites Zeitalter', short: 'Z.', years: 30 },
      { name: 'Erstes Zeitalter', short: 'E.' },
    ])
    expect([b.timePoints[0]!.date!.era, b.persons[0]!.born!.era]).toEqual([1, 2])
  })

  it('entfernt nur Ungenutztes, die einzige Zeitrechnung aber mit Umrechnung', () => {
    const b = book([{ era: 2, year: 3, month: 3 }])
    expect(dateUses(b, 'month', 3)).toBe(1)
    expect(removeCalendarEntry(b, 'month', 2)).toBe(false)
    removeCalendarEntry(b, 'month', 0)
    expect(b.timePoints[0]!.date).toEqual({ era: 2, year: 3, month: 2 })
    expect(removeCalendarEntry(b, 'era', 1)).toBe(false)
    const single = book([{ era: 1, year: 3 }, { era: 0, year: 5 }], undefined, { ...cal, eras: [{ name: 'Erste', short: 'E.' }] })
    removeCalendarEntry(single, 'era', 0)
    expect(single.timePoints.map((t) => t.date)).toEqual([{ year: 3 }, { year: -4 }])
  })

  it('rechnet bei der ersten Zeitrechnung bisherige Jahre um', () => {
    const b = book([{ year: 7 }, { year: 0 }, { year: -5 }], undefined, NO_CALENDAR)
    addEra(b)
    expect(b.timePoints.map((t) => t.date)).toEqual([
      { era: 1, year: 7 },
      { era: 0, year: 1 },
      { era: 0, year: 6 },
    ])
    addEra(b)
    expect(b.calendar!.eras.map((e) => e.years)).toEqual([7, undefined])
  })
})
