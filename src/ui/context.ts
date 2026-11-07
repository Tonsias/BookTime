import { createContext, useContext } from 'react'
import type { Hint } from '../checks'
import type { Recipe, Scope } from '../edit/ops'
import type { Book, TimePoint } from '../model'
import type { Selection } from './types'

/** Was alle Bedienelemente zum Lesen und Ändern des Buchs brauchen */
export interface BookUi {
  book: Book
  points: TimePoint[]
  current: number
  scope: Scope
  hints: Hint[]
  selection: Selection | null
  /** Beispielbuch mit lokaler Arbeitskopie statt eines GitHub-Repos */
  sample: boolean
  /** Änderung mit Bezeichnung für Rückgängig; meldet Verbote selbst und liefert, ob sie übernommen wurde */
  change: (label: string, recipe: Recipe) => boolean
  select: (selection: Selection | null) => void
  jump: (index: number) => void
  remove: (id: string) => void
  openHint: (key?: string) => void
  /** Feld, das sofort in Bearbeitung gehen soll (z. B. `name:<id>` nach dem Anlegen) */
  editRequest: string | null
  requestEdit: (field: string | null) => void
  expanded: Set<string>
  toggle: (id: string, open?: boolean) => void
  upload: (file: File, name: string) => Promise<string>
  imageUrl: (file: string) => Promise<string | undefined>
}

/** Kontext der Buchansicht */
export const UiContext = createContext<BookUi | null>(null)

/** Zugriff auf Buch und Aktionen der Buchansicht */
export function useUi() {
  const ui = useContext(UiContext)
  if (!ui) throw new Error('useUi außerhalb der Buchansicht')
  return ui
}
