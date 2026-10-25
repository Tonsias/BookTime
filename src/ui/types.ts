import type { ElementKind } from '../model'

/** Kamera-Ansicht der 3D-Szene */
export type View = 'raum' | 'netz' | 'zeit'

/** Aktuell ausgewähltes Element */
export interface Selection {
  kind: ElementKind
  id: string
}
