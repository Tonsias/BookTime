import type { Book, BookDate, Calendar } from './model'

/** Kalender ohne Monate, Wochentage und Zeitrechnungen: Daten sind einfache Jahreszahlen */
export const NO_CALENDAR: Calendar = { months: [], weekdays: [], firstWeekday: 0, before: { name: 'vor der ersten Zeitrechnung', short: 'v. Z.' }, eras: [] }

/** Kalender des Buchs, sonst nur Jahreszahlen */
export const calendarOf = (book: Book) => book.calendar ?? NO_CALENDAR

const mod = (a: number, n: number) => ((a % n) + n) % n
const sum = (list: number[]) => list.reduce((a, b) => a + b, 0)
const eraStart = (cal: Calendar, era: number) => 1 + sum(cal.eras.slice(0, era - 1).map((e) => e.years ?? 0))
const yearDays = (cal: Calendar) => sum(cal.months.map((m) => m.days))

/** Fortlaufendes Jahr: Jahr 1 der ersten Zeitrechnung ist 1, davor 0, −1, … */
export function absoluteYear(cal: Calendar, date: BookDate) {
  if (date.era === undefined) return date.year
  return date.era === 0 ? 1 - date.year : eraStart(cal, date.era) + date.year - 1
}

/** Datum zu einem fortlaufenden Jahr in den Zeitrechnungen des Kalenders */
export function fromAbsoluteYear(cal: Calendar, year: number): Pick<BookDate, 'era' | 'year'> {
  if (!cal.eras.length) return { year }
  if (year <= 0) return { era: 0, year: 1 - year }
  let era = 1
  while (era < cal.eras.length && year >= eraStart(cal, era + 1)) era++
  return { era, year: year - eraStart(cal, era) + 1 }
}

/** Vergleich in der gemeinsamen Genauigkeit: negativ, wenn `a` früher liegt */
export function compareDates(cal: Calendar, a: BookDate, b: BookDate) {
  const years = absoluteYear(cal, a) - absoluteYear(cal, b)
  if (years || !a.month || !b.month) return years
  const months = a.month - b.month
  if (months || !a.day || !b.day) return months
  return a.day - b.day
}

const complete = (cal: Calendar, d: BookDate) => !!(d.month && d.day && cal.months.length)

function weekday(cal: Calendar, d: BookDate) {
  if (!complete(cal, d) || !cal.weekdays.length) return undefined
  const day = (absoluteYear(cal, d) - 1) * yearDays(cal) + sum(cal.months.slice(0, d.month! - 1).map((m) => m.days)) + d.day! - 1
  return cal.weekdays[mod(cal.firstWeekday + day, cal.weekdays.length)]
}

// Kürzel der Zeitrechnung eines Datums, leer ohne Zeitrechnungen
const eraShort = (cal: Calendar, d: BookDate) => (d.era === undefined ? '' : d.era === 0 ? cal.before.short : (cal.eras[d.era - 1]?.short ?? `Zeitrechnung ${d.era}`))

/** Lesbares Datum, z. B. „Feuertag, 14. Saatmond 412 Z.“ */
export function formatDate(cal: Calendar, d: BookDate) {
  const month = d.month ? (cal.months[d.month - 1]?.name ?? `Monat ${d.month}`) : ''
  const day = weekday(cal, d)
  const era = eraShort(cal, d)
  return `${day ? `${day}, ` : ''}${d.day ? `${d.day}. ` : ''}${month ? `${month} ` : ''}${d.year}${era ? ` ${era}` : ''}`
}

/** Abstand bis zum Beginn der nächsten Zeitrechnung, wenn es eine gibt */
export function untilNextEra(cal: Calendar, d: BookDate) {
  if (d.era === undefined || d.era >= cal.eras.length) return undefined
  const years = eraStart(cal, d.era + 1) - absoluteYear(cal, d)
  return `${years} ${years === 1 ? 'Jahr' : 'Jahre'} vor Beginn von „${cal.eras[d.era]!.name}“`
}

/** Alter zu einem Datum in vollen Jahren; nur mit Jahren als „ca.“ */
export function age(cal: Calendar, born: BookDate, at: BookDate) {
  if (compareDates(cal, at, born) < 0) return 'noch nicht geboren'
  const exact = complete(cal, born) && complete(cal, at)
  let years = absoluteYear(cal, at) - absoluteYear(cal, born)
  if (exact && (at.month! < born.month! || (at.month === born.month && at.day! < born.day!))) years--
  return `${exact ? '' : 'ca. '}${years} ${years === 1 ? 'Jahr' : 'Jahre'}`
}

/** Warum ein Datum nicht zum Kalender passt (Hinweis), sonst undefined */
export function calendarMismatch(cal: Calendar, d: BookDate) {
  if (cal.eras.length && d.era === undefined) return 'Die Zeitrechnung fehlt.'
  if (!cal.eras.length && d.era !== undefined) return 'Der Kalender hat keine Zeitrechnungen.'
  const era = d.era ? cal.eras[d.era - 1] : undefined
  if (d.era && !era) return `Die Zeitrechnung ${d.era} gibt es im Kalender nicht.`
  if (era?.years && d.year > era.years) return `${era.name} dauert nur ${era.years} Jahre.`
  if (!d.month) return undefined
  const month = cal.months[d.month - 1]
  if (!month) return cal.months.length ? `Den Monat ${d.month} gibt es im Kalender nicht.` : 'Der Kalender hat keine Monate.'
  if (d.day && d.day > month.days) return `${month.name} hat nur ${month.days} Tage.`
}

/** Formfehler eines Datums (Verbot), sonst undefined */
export function dateError(d: BookDate) {
  if (d.day && !d.month) return 'Datum hat einen Tag, aber keinen Monat'
  if (d.era !== undefined && (d.era < 0 || d.year < 1)) return 'Jahr in einer Zeitrechnung ist kleiner als 1'
}

/** Rückt ein Datum in die Grenzen des Kalenders: Zeitrechnung, Jahr, Monat und Tag */
export function fitDate(cal: Calendar, d: BookDate): BookDate {
  const out = { ...d }
  if (!cal.eras.length) delete out.era
  else if (out.era === undefined) Object.assign(out, fromAbsoluteYear(cal, out.year))
  else if (out.era > cal.eras.length) out.era = cal.eras.length
  const years = out.era ? cal.eras[out.era - 1]!.years : undefined
  if (years && out.year > years) out.year = years
  if (!out.month) return out
  const month = cal.months[Math.min(out.month, cal.months.length) - 1]
  if (!month) {
    delete out.month
    delete out.day
    return out
  }
  out.month = Math.min(out.month, cal.months.length)
  if (out.day && out.day > month.days) out.day = month.days
  return out
}
