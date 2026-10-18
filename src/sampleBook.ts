import type { Book, Place, RelationPhase } from './model'

const place = (id: string, name: string, color: string, description: string, x: number, y: number, extra: Partial<Place> = {}): Place => ({
  id,
  name,
  color,
  description,
  existence: {},
  images: [],
  phases: [{ id: `${id}-lage`, timing: {}, x, y, images: [] }],
  ...extra,
})

const phase = (id: string, type: string, strength: RelationPhase['strength'], from: string, to: string, extra: Partial<RelationPhase> = {}): RelationPhase => ({
  id,
  type,
  strength,
  timing: from === to ? { at: from } : { from, to },
  ...extra,
})

/** Beispielgeschichte für den Prototyp */
export const sampleBook: Book = {
  title: 'Der Brief von Velmar',
  timePoints: [
    { id: 't1', name: 'Ankunft in Velmar', dateLabel: 'Frühling, Jahr 412', order: 1 },
    { id: 't2', name: 'Der gestohlene Brief', order: 2 },
    { id: 't3', name: 'Flucht in den Wald', order: 3 },
    { id: 't4', name: 'Verrat auf Ostfels', order: 4 },
    { id: 't5', name: 'Das Konzil', dateLabel: 'Frühsommer, Jahr 412', order: 5 },
  ],
  persons: [
    { id: 'anna', color: '#f87171', name: 'Anna', description: 'Kartografin, sucht den verschwundenen Brief ihres Vaters.', existence: {}, images: [] },
    { id: 'ben', color: '#fb923c', name: 'Ben', description: 'Schmuggler und Annas ältester Freund. Hat eigene Pläne.', existence: {}, images: [] },
    { id: 'mira', color: '#e879f9', name: 'Mira', description: 'Burgherrin von Ostfels, zwischen Pflicht und Gewissen.', existence: {}, images: [] },
    { id: 'kael', color: '#94a3b8', name: 'Kael', description: 'Hauptmann der Garde. Loyal – nur wem?', existence: {}, images: [] },
    { id: 'abt', color: '#fde68a', name: 'Abt Corvin', description: 'Hüter alter Verträge, kennt den Inhalt des Briefs.', existence: { to: 't4' }, images: [], note: 'Stirbt bei T4 – Gift oder Herz?' },
    { id: 'ilya', color: '#2dd4bf', name: 'Ilya', description: 'Die Fremde aus dem Wald. Niemand weiß, woher sie kommt.', existence: { from: 't3' }, images: [] },
  ],
  groups: [{ id: 'garde', color: '#cbd5e1', name: 'Garde von Ostfels', description: 'Die Wachen der Burg, Kael unterstellt.', existence: {}, images: [] }],
  places: [
    place('velmar', 'Velmar', '#38bdf8', 'Hafenstadt im Norden, Umschlagplatz für Schmuggelware und Gerüchte.', -6, 6, { radius: 3.2 }),
    {
      ...place('anker', 'Taverne zum Anker', '#7dd3fc', 'Verrauchte Hafenkneipe, Bens Stammplatz.', 0, 0),
      radius: 1,
      phases: [{ id: 'anker-lage', timing: {}, parent: 'velmar', x: 1.8, y: -1.4, images: [] }],
    },
    place('ostfels', 'Burg Ostfels', '#a78bfa', 'Sitz der Familie von Mira, bewacht von Kaels Garde.', 5, 2.5),
    place('ardun', 'Wald von Ardun', '#34d399', 'Alter Wald, in dem man sich verirrt – oder versteckt.', -5, -2.5),
    place('kloster', 'Kloster Sankt Ilm', '#fbbf24', 'Neutraler Boden. Hier wird das Konzil abgehalten.', 5, -7),
  ],
  events: [
    { id: 'e1', color: '#facc15', title: 'Ankunft in Velmar', timing: { at: 't1' }, place: 'velmar', description: 'Anna erreicht Velmar und trifft Ben wieder.', result: 'Anna erzählt Ben vom Brief.', images: [] },
    { id: 'e2', color: '#fb7185', title: 'Der gestohlene Brief', timing: { at: 't2' }, place: 'anker', description: 'Ben stiehlt den Brief aus Annas Gepäck.', result: 'Ben flieht mit dem Brief nach Ostfels.', images: [] },
    { id: 'e3', color: '#4ade80', title: 'Flucht in den Wald', timing: { at: 't3' }, place: 'ardun', description: 'Anna folgt Bens Spur und trifft auf Mira – und auf eine Fremde.', result: 'Anna und Mira schließen sich zusammen.', images: [] },
    { id: 'e4', color: '#f97316', title: 'Verrat auf Ostfels', timing: { at: 't4' }, place: 'ostfels', description: 'Kaels Pakt mit Ben fliegt auf.', result: 'Mira wendet sich gegen Kael.', images: [] },
    { id: 'e5', color: '#a1a1aa', title: 'Tod im Kloster', timing: { at: 't4' }, place: 'kloster', description: 'Abt Corvin wird vergiftet.', result: 'Den Inhalt des Briefs kennt nun niemand mehr.', images: [] },
    { id: 'e6', color: '#c7d2fe', title: 'Das Konzil', timing: { from: 't5' }, place: 'kloster', description: 'Alle Wege führen nach Sankt Ilm. Ben gesteht.', result: 'Anna und Ben versöhnen sich.', images: [] },
  ],
  relationTypes: [
    { id: 'elternteil', name: 'Elternteil von', category: 'Familie', directed: true, inverseName: 'Kind von', color: '#c084fc' },
    { id: 'geschwister', name: 'Geschwister', category: 'Familie', directed: false, color: '#a78bfa' },
    { id: 'liebt', name: 'liebt', category: 'Gefühl', directed: true, color: '#f472b6' },
    { id: 'hasst', name: 'hasst', category: 'Gefühl', directed: true, color: '#ef4444' },
    { id: 'misstraut', name: 'misstraut', category: 'Gefühl', directed: true, color: '#f59e0b' },
    { id: 'freunde', name: 'Freunde', category: 'Sozial', directed: false, color: '#4ade80' },
    { id: 'verbuendete', name: 'Verbündete', category: 'Sozial', directed: false, color: '#60a5fa' },
    { id: 'feinde', name: 'Feinde', category: 'Sozial', directed: false, color: '#dc2626' },
  ],
  facts: [
    { kind: 'stay', id: 's-anna-1', person: 'anna', place: 'velmar', timing: { from: 't1', to: 't2' } },
    { kind: 'stay', id: 's-anna-2', person: 'anna', place: 'ardun', timing: { from: 't3', to: 't4' } },
    { kind: 'stay', id: 's-anna-3', person: 'anna', place: 'kloster', timing: { from: 't5' }, causedBy: 'e6' },
    { kind: 'stay', id: 's-ben-1', person: 'ben', place: 'anker', timing: { at: 't1' } },
    { kind: 'journey', id: 'j-ben', person: 'ben', origin: 'anker', destination: 'ostfels', timing: { at: 't2' }, causedBy: 'e2', note: 'Ben flieht nachts mit dem Brief.' },
    { kind: 'stay', id: 's-ben-2', person: 'ben', place: 'ostfels', timing: { from: 't3', to: 't4' } },
    { kind: 'stay', id: 's-ben-3', person: 'ben', place: 'kloster', timing: { from: 't5' } },
    { kind: 'stay', id: 's-mira-1', person: 'mira', place: 'ostfels', timing: { from: 't1', to: 't2' } },
    { kind: 'stay', id: 's-mira-2', person: 'mira', place: 'ardun', timing: { from: 't3', to: 't4' }, note: 'Mira folgt heimlich einem Gerücht über den Brief.' },
    { kind: 'stay', id: 's-mira-3', person: 'mira', place: 'kloster', timing: { from: 't5' } },
    { kind: 'stay', id: 's-kael', person: 'kael', place: 'ostfels', timing: {} },
    { kind: 'stay', id: 's-abt', person: 'abt', place: 'kloster', timing: { to: 't4' } },
    { kind: 'stay', id: 's-ilya-1', person: 'ilya', place: 'ardun', timing: { from: 't3', to: 't4' } },
    { kind: 'stay', id: 's-ilya-2', person: 'ilya', place: 'kloster', timing: { from: 't5' } },

    { kind: 'membership', id: 'm-kael', person: 'kael', group: 'garde', role: 'Hauptmann', timing: {} },

    { kind: 'participation', id: 'p-anna-1', actor: 'anna', event: 'e1' },
    { kind: 'participation', id: 'p-ben-1', actor: 'ben', event: 'e1' },
    { kind: 'participation', id: 'p-ben-2', actor: 'ben', event: 'e2', role: 'Dieb' },
    { kind: 'participation', id: 'p-anna-3', actor: 'anna', event: 'e3' },
    { kind: 'participation', id: 'p-mira-3', actor: 'mira', event: 'e3' },
    { kind: 'participation', id: 'p-ilya-3', actor: 'ilya', event: 'e3' },
    { kind: 'participation', id: 'p-kael-4', actor: 'kael', event: 'e4' },
    { kind: 'participation', id: 'p-garde-4', actor: 'garde', event: 'e4' },
    { kind: 'participation', id: 'p-abt-5', actor: 'abt', event: 'e5', role: 'Opfer' },
    ...['anna', 'ben', 'mira', 'ilya'].map((actor) => ({ kind: 'participation' as const, id: `p-${actor}-6`, actor, event: 'e6' })),

    {
      kind: 'relation',
      id: 'r-anna-ben',
      from: 'anna',
      to: 'ben',
      phases: [
        phase('r-anna-ben-1', 'freunde', 4, 't1', 't1'),
        phase('r-anna-ben-2', 'misstraut', 3, 't2', 't4', { causedBy: 'e2' }),
        phase('r-anna-ben-3', 'freunde', 3, 't5', 't5', { causedBy: 'e6', note: 'Ben gesteht den Diebstahl.' }),
      ],
    },
    {
      kind: 'relation',
      id: 'r-mira-kael',
      from: 'mira',
      to: 'kael',
      phases: [phase('r-mira-kael-1', 'liebt', 4, 't1', 't3'), phase('r-mira-kael-2', 'hasst', 5, 't4', 't5', { causedBy: 'e4' })],
    },
    { kind: 'relation', id: 'r-kael-abt', from: 'kael', to: 'abt', phases: [phase('r-kael-abt-1', 'verbuendete', 3, 't1', 't4')] },
    {
      kind: 'relation',
      id: 'r-ben-kael',
      from: 'ben',
      to: 'kael',
      phases: [
        phase('r-ben-kael-1', 'verbuendete', 2, 't2', 't4', { causedBy: 'e2', note: 'Kael bezahlt Ben für den Brief.' }),
        phase('r-ben-kael-2', 'feinde', 4, 't5', 't5', { causedBy: 'e6' }),
      ],
    },
    { kind: 'relation', id: 'r-anna-mira', from: 'anna', to: 'mira', phases: [phase('r-anna-mira-1', 'freunde', 3, 't3', 't5', { causedBy: 'e3' })] },
    {
      kind: 'relation',
      id: 'r-ilya-anna',
      from: 'ilya',
      to: 'anna',
      phases: [phase('r-ilya-anna-1', 'misstraut', 2, 't3', 't3'), phase('r-ilya-anna-2', 'freunde', 4, 't4', 't5', { note: 'Ilya rettet Anna vor Kaels Spähern.' })],
    },
    { kind: 'relation', id: 'r-garde-ilya', from: 'garde', to: 'ilya', phases: [phase('r-garde-ilya-1', 'misstraut', 3, 't4', 't5')] },
  ],
}
