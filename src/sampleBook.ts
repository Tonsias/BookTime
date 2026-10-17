import type { Book } from './model'

export const sampleBook: Book = {
  title: 'Der Brief von Velmar',
  entities: [
    { id: 'velmar', kind: 'place', name: 'Velmar', color: '#38bdf8', position: [-6, 6], description: 'Hafenstadt im Norden, Umschlagplatz für Schmuggelware und Gerüchte.' },
    { id: 'ostfels', kind: 'place', name: 'Burg Ostfels', color: '#a78bfa', position: [5, 2.5], description: 'Sitz der Familie von Mira, bewacht von Kaels Garde.' },
    { id: 'ardun', kind: 'place', name: 'Wald von Ardun', color: '#34d399', position: [-5, -2.5], description: 'Alter Wald, in dem man sich verirrt – oder versteckt.' },
    { id: 'kloster', kind: 'place', name: 'Kloster Sankt Ilm', color: '#fbbf24', position: [5, -7], description: 'Neutraler Boden. Hier wird das Konzil abgehalten.' },

    { id: 'anna', kind: 'person', name: 'Anna', color: '#f87171', description: 'Kartografin, sucht den verschwundenen Brief ihres Vaters.' },
    { id: 'ben', kind: 'person', name: 'Ben', color: '#fb923c', description: 'Schmuggler und Annas ältester Freund. Hat eigene Pläne.' },
    { id: 'mira', kind: 'person', name: 'Mira', color: '#e879f9', description: 'Burgherrin von Ostfels, zwischen Pflicht und Gewissen.' },
    { id: 'kael', kind: 'person', name: 'Kael', color: '#94a3b8', description: 'Hauptmann der Garde. Loyal – nur wem?' },
    { id: 'abt', kind: 'person', name: 'Abt Corvin', color: '#fde68a', description: 'Hüter alter Verträge, kennt den Inhalt des Briefs.' },
    { id: 'ilya', kind: 'person', name: 'Ilya', color: '#2dd4bf', description: 'Die Fremde aus dem Wald. Niemand weiß, woher sie kommt.' },
  ],
  events: [
    {
      id: 'e1',
      title: 'Ankunft in Velmar',
      description: 'Anna erreicht Velmar und trifft Ben wieder. Auf Ostfels bereitet man sich auf das Konzil vor.',
      changes: [
        { type: 'appear', entity: 'anna', at: 'velmar' },
        { type: 'appear', entity: 'ben', at: 'velmar' },
        { type: 'appear', entity: 'mira', at: 'ostfels' },
        { type: 'appear', entity: 'kael', at: 'ostfels' },
        { type: 'appear', entity: 'abt', at: 'kloster' },
        { type: 'relation', a: 'anna', b: 'ben', kind: 'freund' },
        { type: 'relation', a: 'mira', b: 'kael', kind: 'liebe' },
        { type: 'relation', a: 'kael', b: 'abt', kind: 'verbündet' },
        { type: 'mood', entity: 'anna', mood: 'neugierig, voller Hoffnung' },
      ],
    },
    {
      id: 'e2',
      title: 'Der gestohlene Brief',
      description: 'Ben stiehlt den Brief aus Annas Gepäck und bringt ihn nach Ostfels.',
      changes: [
        { type: 'move', entity: 'ben', to: 'ostfels', note: 'Ben flieht nachts mit dem Brief.' },
        { type: 'relation', a: 'anna', b: 'ben', kind: 'misstrauen' },
        { type: 'relation', a: 'ben', b: 'kael', kind: 'verbündet', note: 'Kael bezahlt Ben für den Brief.' },
        { type: 'mood', entity: 'anna', mood: 'verletzt, entschlossen' },
      ],
    },
    {
      id: 'e3',
      title: 'Flucht in den Wald',
      description: 'Anna folgt Bens Spur und trifft im Wald auf Mira – und auf eine Fremde.',
      changes: [
        { type: 'move', entity: 'anna', to: 'ardun' },
        { type: 'move', entity: 'mira', to: 'ardun', note: 'Mira folgt heimlich einem Gerücht über den Brief.' },
        { type: 'appear', entity: 'ilya', at: 'ardun' },
        { type: 'relation', a: 'anna', b: 'mira', kind: 'freund' },
        { type: 'relation', a: 'ilya', b: 'anna', kind: 'misstrauen' },
        { type: 'mood', entity: 'mira', mood: 'zerrissen' },
      ],
    },
    {
      id: 'e4',
      title: 'Verrat auf Ostfels',
      description: 'Mira erfährt von Kaels Pakt. Im Kloster stirbt der Abt.',
      changes: [
        { type: 'relation', a: 'mira', b: 'kael', kind: 'feind', note: 'Mira erfährt von Kaels Pakt mit Ben.' },
        { type: 'relation', a: 'ilya', b: 'anna', kind: 'freund', note: 'Ilya rettet Anna vor Kaels Spähern.' },
        { type: 'exit', entity: 'abt', note: 'Abt Corvin wird vergiftet.' },
        { type: 'mood', entity: 'kael', mood: 'kalt entschlossen' },
      ],
    },
    {
      id: 'e5',
      title: 'Das Konzil im Kloster',
      description: 'Alle Wege führen nach Sankt Ilm. Ben gesteht.',
      changes: [
        { type: 'move', entity: 'anna', to: 'kloster' },
        { type: 'move', entity: 'mira', to: 'kloster' },
        { type: 'move', entity: 'ilya', to: 'kloster' },
        { type: 'move', entity: 'ben', to: 'kloster' },
        { type: 'relation', a: 'anna', b: 'ben', kind: 'freund', note: 'Ben gesteht den Diebstahl.' },
        { type: 'relation', a: 'ben', b: 'kael', kind: 'feind' },
        { type: 'mood', entity: 'anna', mood: 'versöhnt, aber wachsam' },
      ],
    },
  ],
}
