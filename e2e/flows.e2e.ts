import { expect, test, type Page } from '@playwright/test'
import { drag, emptySpot, insideOf, open, panel, ready, saved, screenOf, search, settle } from './helpers'

let problems: string[] = []

test.beforeEach(async ({ page }) => {
  problems = await open(page)
})

test.afterEach(() => {
  expect(problems, 'Konsolenfehler oder -warnungen').toEqual([])
})

const netz = async (page: Page) => {
  await page.keyboard.press('2')
  await settle(page)
}
const stand = (page: Page) => panel(page).getByRole('region', { name: /^Stand/ })
const verlauf = (page: Page) => panel(page).getByRole('region', { name: 'Verlauf' })

test('Ort am Ring ziehen verschiebt ihn ab hier und bleibt nach dem Neuladen', async ({ page }) => {
  await netz(page)
  const before = await page.evaluate(() => window.__booktime!.pos(window.__booktime!.id('Wald von Ardun')!))
  const ring = await page.evaluate(() => {
    const b = window.__booktime!
    const [u, v] = b.pos(b.id('Wald von Ardun')!)!
    // Auf den Ring selbst fassen, nicht ins Innere
    for (let a = 0; a < Math.PI * 2; a += 0.2) for (const r of [2.1, 2.4, 2.6, 2.8, 3]) {
      const [x, y] = [u + Math.cos(a) * r, v + Math.sin(a) * r]
      if (!b.hit(x, y)) continue
      return b.net(x, y)
    }
    return null
  })
  const target = { x: ring!.x + 120, y: ring!.y + 40 }
  await drag(page, ring!, target, /^Wald von Ardun verschieben · ab 1$/)
  await expect(page.getByRole('button', { name: 'Rückgängig', exact: true }).first()).toBeEnabled()
  const after = await page.evaluate(() => window.__booktime!.pos(window.__booktime!.id('Wald von Ardun')!))
  expect(after).not.toEqual(before)
  await saved(page)
  await page.reload()
  await ready(page)
  expect(await page.evaluate(() => window.__booktime!.pos(window.__booktime!.id('Wald von Ardun')!))).toEqual(after)
})

test('Ort eines Aufenthalts im Panel: ab hier teilt, ganze Phase ändert alles', async ({ page }) => {
  await page.getByRole('slider', { name: 'Zeitpunkt' }).focus()
  await page.keyboard.press('ArrowRight')
  await search(page, 'Anna')
  const change = async () => {
    const row = stand(page).getByRole('button', { name: /^in / })
    if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click()
    await panel(page).getByRole('button', { name: 'Ort', exact: true }).click()
    await page.getByRole('textbox', { name: 'Suchen' }).fill('Kloster')
    await page.keyboard.press('Enter')
  }
  await stand(page).getByRole('button', { name: /^in / }).click()
  await expect(panel(page).getByText(/ändern sich ab 2/)).toBeVisible()
  await stand(page).getByRole('button', { name: /^in / }).click()
  await change()
  await expect(stand(page)).toContainText('in Kloster Sankt Ilm')
  await expect(verlauf(page)).toContainText('nur 1 in Velmar')

  await page.keyboard.press('Control+Z')
  await expect(verlauf(page)).toContainText('bis 2 in Velmar')
  await page.locator('label', { hasText: 'Ganze Phase' }).click()
  await change()
  await expect(verlauf(page)).toContainText('bis 2 in Kloster Sankt Ilm')
  await expect(verlauf(page)).not.toContainText('2 in Velmar')
})

test('Person auf ein Event ziehen und Event aus der Leiste auf einen Ort', async ({ page }) => {
  await netz(page)
  await page.keyboard.press('n')
  await page.keyboard.press('e')
  await page.keyboard.type('Markttag')
  await page.keyboard.press('Enter')
  const chip = page.locator('.tray-chip', { hasText: 'Markttag' })
  const box = (await chip.boundingBox())!
  await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, await insideOf(page, 'Wald von Ardun'), '„Markttag“ findet in Wald von Ardun statt')
  await expect(chip).toHaveCount(0)
  await settle(page, 'Markttag')
  await drag(page, (await screenOf(page, 'Kael'))!, (await screenOf(page, 'Markttag'))!, 'Kael nimmt teil an „Markttag“')
  await search(page, 'Markttag')
  await expect(panel(page).getByRole('region', { name: 'Beteiligt' })).toContainText('Kael')
})

test('Neues entsteht direkt aus Suche und Verknüpfungsliste', async ({ page }) => {
  await page.keyboard.press('Control+K')
  await page.getByPlaceholder(/Person, Gruppe, Ort/).fill('Hafenmeisterin')
  await page.getByRole('button', { name: '„Hafenmeisterin“ als Person anlegen' }).click()
  await expect(panel(page).getByRole('button', { name: 'Name bearbeiten' })).toHaveText('Hafenmeisterin')
  await expect(panel(page)).toContainText('Zu diesem Zeitpunkt nirgends')

  await panel(page).getByRole('button', { name: '+ Verknüpfung' }).click()
  await page.getByRole('option', { name: /^Aufenthalt/ }).click()
  await page.getByRole('textbox', { name: 'Aufenthalt …' }).fill('Leuchtturm')
  await page.getByRole('option', { name: '+ „Leuchtturm“ als Ort anlegen' }).click()
  await expect(stand(page)).toContainText('in Leuchtturm')
  await expect(page.locator('.scene-label', { hasText: 'Leuchtturm' })).toBeVisible()
  await page.keyboard.press('Control+Z')
  await expect(page.locator('.scene-label', { hasText: 'Leuchtturm' })).toHaveCount(0)
})

test('Änderung in einem anderen Tab lädt die Arbeitskopie neu', async ({ page, context }) => {
  const other = await context.newPage()
  await other.goto('./')
  await ready(other)
  await search(other, 'Mira')
  await panel(other).getByRole('button', { name: 'Name bearbeiten' }).click()
  await other.getByRole('textbox', { name: 'Name' }).fill('Mira Sol')
  await other.keyboard.press('Enter')
  await saved(other)
  await page.bringToFront()
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByText('Die Arbeitskopie wurde in einem anderen Tab geändert und neu geladen.')).toBeVisible()
  await expect(page.locator('.scene-label', { hasText: 'Mira Sol' })).toBeVisible()
})

test('Verbotenes wird verhindert und gemeldet', async ({ page }) => {
  await page.getByRole('button', { name: 'Buch bearbeiten' }).click()
  const rows = panel(page).locator('.tp-row')
  await rows.last().dragTo(rows.first())
  await expect(page.getByText(/^Nicht möglich: /)).toBeVisible()
})

test('Selbst bearbeiten öffnet den betroffenen Fakt', async ({ page }) => {
  await search(page, 'Abt Corvin')
  await panel(page).getByRole('slider', { name: 'Existenz: Ende' }).focus()
  await page.keyboard.press('ArrowLeft')
  await page.getByRole('button', { name: /Hinweise? auflösen/ }).click()
  await page.getByRole('button', { name: 'Selbst bearbeiten' }).click()
  await expect(page.getByRole('dialog', { name: 'Hinweis auflösen' })).toBeHidden()
  await expect(panel(page).locator('.fact.open')).toHaveCount(1)
})

test('In der Ansicht Zeit wird nicht gezogen', async ({ page }) => {
  await page.keyboard.press('3')
  await settle(page)
  const spot = await emptySpot(page)
  await page.mouse.dblclick(spot.x, spot.y)
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveCount(0)
})
