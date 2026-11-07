import type { ElementKind } from '../model'

/** Kamera-Ansicht der 3D-Szene */
export type View = 'raum' | 'netz' | 'zeit'

/** Was das Panel zeigt: ein Element, ein Zeitpunkt, eine Beziehungsart oder das Buch (id leer) */
export interface Selection {
  kind: ElementKind | 'timePoint' | 'relationType' | 'book'
  id: string
}
