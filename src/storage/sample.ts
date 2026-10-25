import type { BookFiles } from './format'

const raw = import.meta.glob<string>('/beispiel/**/*.{json,md}', { query: '?raw', import: 'default', eager: true })

/** Dateien des Beispielbuchs aus dem Ordner `beispiel/`, beim Build eingebunden */
export const sampleFiles: BookFiles = Object.fromEntries(Object.entries(raw).map(([path, text]) => [path.slice('/beispiel/'.length), text]))

const urls = import.meta.glob<string>('/beispiel/images/*', { query: '?url', import: 'default', eager: true })

/** Adressen der Bilder des Beispielbuchs, nach Pfad im Buch */
export const sampleImages: Record<string, string> = Object.fromEntries(Object.entries(urls).map(([path, url]) => [path.slice('/beispiel/'.length), url]))
