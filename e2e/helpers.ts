import { expect, type Page } from '@playwright/test'

type Point = { x: number; y: number }
type Net = [number, number]

declare global {
  interface Window {
    __booktime?: {
      id: (name: string) => string | null
      pos: (id: string) => Net | null
      screen: (id: string) => Point | null
      net: (u: number, v: number) => Point | null
      hit: (u: number, v: number) => { kind: string; id: string } | null
    }
  }
}

/** Öffnet die Buchansicht mit frischem Browser-Speicher und sammelt Konsolenfehler und -warnungen */
export async function open(page: Page) {
  const problems: string[] = []
  page.on('console', (m) => {
    // Erlaubt: die Deprecation-Meldung aus @react-three/fiber und Leistungshinweise des Software-Grafiktreibers im Headless-Chromium
    const allowed = m.text().includes('THREE.Clock') || /^\[\.WebGL-\w+\]GL Driver Message .*Performance/.test(m.text())
    if ((m.type() === 'error' || m.type() === 'warning') && !allowed) problems.push(m.text())
  })
  page.on('pageerror', (e) => problems.push(e.message))
  await page.goto('./')
  await ready(page)
  return problems
}

/** Wartet, bis Buch und Szene geladen sind, auch nach einem Neuladen */
export async function ready(page: Page) {
  await expect(page.getByRole('button', { name: 'Buch bearbeiten' })).toBeVisible()
  await page.waitForFunction(() => !!window.__booktime?.screen(window.__booktime.id('Ben') ?? ''))
}

/** Wartet, bis die Kamerafahrt vorbei ist und ein Element still steht */
export async function settle(page: Page, name = 'Anna') {
  let last = ''
  let same = 0
  for (let k = 0; k < 60; k++) {
    const now = JSON.stringify(await screenOf(page, name))
    same = now === last && now !== 'null' ? same + 1 : 0
    if (same >= 3) return
    last = now
    await page.waitForTimeout(150)
  }
  throw new Error(`${name} kommt nicht zur Ruhe`)
}

/** Bildschirmposition eines Elements auf der aktuellen Ebene */
export async function screenOf(page: Page, name: string) {
  return page.evaluate((n) => {
    const b = window.__booktime!
    const id = b.id(n)
    return id ? b.screen(id) : null
  }, name)
}

/** Stelle in einem Ort, an der keine Person und kein Event liegt */
export async function insideOf(page: Page, name: string): Promise<Point> {
  const point = await page.evaluate((n) => {
    const b = window.__booktime!
    const id = b.id(n)!
    const [u, v] = b.pos(id)!
    for (let r = 0.9; r < 3; r += 0.3)
      for (let a = 0; a < Math.PI * 2; a += 0.3) {
        const [x, y] = [u + Math.cos(a) * r, v + Math.sin(a) * r]
        if (b.hit(x, y)?.id === id) return b.net(x, y)
      }
    return null
  }, name)
  if (!point) throw new Error(`Keine freie Stelle in ${name}`)
  return point
}

/** Freie Stelle auf der Ebene, außerhalb aller Orte */
export async function emptySpot(page: Page): Promise<Point> {
  const point = await page.evaluate(() => {
    const b = window.__booktime!
    for (let u = -9; u <= 9; u += 1.5) for (let v = -9; v <= 9; v += 1.5) if (!b.hit(u, v)) return b.net(u, v)
    return null
  })
  if (!point) throw new Error('Keine freie Stelle auf der Ebene')
  return point
}

/** Zieht mit der Maus in kleinen Schritten; prüft vor dem Loslassen optional das Etikett am Zeiger */
export async function drag(page: Page, from: Point, to: Point, tag?: string | RegExp) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let k = 1; k <= 12; k++) await page.mouse.move(from.x + ((to.x - from.x) * k) / 12, from.y + ((to.y - from.y) * k) / 12)
  if (tag) await expect(page.locator('.drag-tag')).toHaveText(tag)
  await page.mouse.up()
}

/** Wählt über die Suche aus */
export async function search(page: Page, text: string) {
  await page.keyboard.press('Control+K')
  const input = page.getByPlaceholder(/Person, Gruppe, Ort/)
  await input.fill(text)
  await page.keyboard.press('Enter')
  await expect(input).toBeHidden()
}

/** Das Bearbeiten-Panel */
export const panel = (page: Page) => page.getByRole('complementary', { name: 'Bearbeiten' })

/** Wartet, bis alles in IndexedDB gespeichert ist; das Speichern beginnt erst 300 ms nach der letzten Änderung */
export async function saved(page: Page) {
  await page.waitForTimeout(400)
  await expect(page.getByRole('status').filter({ hasText: /^Gespeichert$/ })).toBeVisible()
}
