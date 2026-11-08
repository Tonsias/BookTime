import { DEFAULT_LAYER } from '../model'

const PIXELS_PER_UNIT = 50

type Size = { width: number; height: number }

const round = (value: number) => Math.round(value * 10) / 10
const fromPixels = (w: number, h: number): Size => ({ width: round(w / PIXELS_PER_UNIT), height: round(h / PIXELS_PER_UNIT) })
const pixels = (value: string | null) => (value && /^\s*[\d.]+(px)?\s*$/.test(value) ? Number.parseFloat(value) : 0)

/** Größe eines SVG: aus width/height, sonst Breite 22 mit Seitenverhältnis der viewBox, sonst 22 × 22 */
export function svgSize(text: string): Size {
  const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement
  const [w, h] = [pixels(svg.getAttribute('width')), pixels(svg.getAttribute('height'))]
  if (w > 0 && h > 0) return fromPixels(w, h)
  const box = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
  const [vw, vh] = [box[2] ?? 0, box[3] ?? 0]
  return { width: DEFAULT_LAYER, height: vw > 0 && vh > 0 ? round((DEFAULT_LAYER * vh) / vw) : DEFAULT_LAYER }
}

/** Größe eines Hintergrundbilds in Welteinheiten nach seinen Pixeln */
export async function backgroundSize(blob: Blob): Promise<Size> {
  if (blob.type === 'image/svg+xml') return svgSize(await blob.text())
  const bitmap = await createImageBitmap(blob)
  const size = fromPixels(bitmap.width, bitmap.height)
  bitmap.close()
  return size
}
