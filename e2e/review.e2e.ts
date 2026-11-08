import { expect, test } from '@playwright/test'
import { drag, insideOf, open, panel, ready, saved, screenOf, search, settle } from './helpers'

// Befunde aus dem Review aus Nutzersicht
let problems: string[] = []

test.beforeEach(async ({ page }) => {
  problems = await open(page)
})

test.afterEach(() => {
  expect(problems, 'Konsolenfehler oder -warnungen').toEqual([])
})

test('Name lässt sich nach F2 mehrfach bearbeiten und verlassen', async ({ page }) => {
  await search(page, 'Anna')
  const name = panel(page).getByRole('button', { name: 'Name bearbeiten' })
  await page.keyboard.press('F2')
  await page.keyboard.type('Annabel')
  await page.keyboard.press('Enter')
  await expect(name).toHaveText('Annabel')
  await page.keyboard.press('F2')
  await page.keyboard.type('Verworfen')
  await page.keyboard.press('Escape')
  await expect(name).toHaveText('Annabel')
  await page.keyboard.press('F2')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('textbox', { name: 'Beschreibung' })).toBeFocused()
})

test('Tab erreicht nach den Textfeldern auch Regler und Knöpfe', async ({ page }) => {
  await search(page, 'Anna')
  await panel(page).getByRole('button', { name: 'Beschreibung bearbeiten' }).click()
  await page.keyboard.press('Tab')
  await expect(panel(page).getByRole('slider', { name: 'Existenz: Beginn' })).toBeFocused()
})

test('Nach dem Umschalten auf „Ganze Phase“ wirken Pfeile und Strg+Z wieder', async ({ page }) => {
  await search(page, 'Ben')
  await panel(page).getByRole('button', { name: 'Name bearbeiten' }).click()
  await page.keyboard.type('o')
  await page.keyboard.press('Enter')
  await page.locator('label', { hasText: 'Ganze Phase' }).click()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Zeitpunkt bearbeiten' })).toHaveText(/^2\. /)
  await expect(page.getByRole('radio', { name: 'Ganze Phase' })).toBeChecked()
  await page.keyboard.press('Control+Z')
  await expect(panel(page).getByRole('button', { name: 'Name bearbeiten' })).toHaveText('Ben')
})

test('Personen bleiben nach dem Neuladen an ihrer Stelle', async ({ page }) => {
  await page.keyboard.press('2')
  await settle(page)
  await page.keyboard.press('n')
  await expect(page.getByRole('menuitem', { name: /Person/ })).toBeVisible()
  await page.keyboard.press('p')
  await expect(page.getByRole('textbox', { name: 'Name' })).toBeFocused()
  await page.keyboard.type('Lio')
  await page.keyboard.press('Enter')
  const chip = page.locator('.tray-chip', { hasText: 'Lio' })
  const box = (await chip.boundingBox())!
  await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, await insideOf(page, 'Burg Ostfels'))
  const positions = () => page.evaluate(() => ['Lio', 'Mira', 'Kael', 'Anna'].map((n) => window.__booktime!.pos(window.__booktime!.id(n)!)))
  const before = await positions()
  await saved(page)
  await page.reload()
  await ready(page)
  expect(await positions()).toEqual(before)
})

test('Nach dem Ziehen wählt der Klick beim Loslassen nichts anderes aus', async ({ page }) => {
  await page.keyboard.press('2')
  await settle(page)
  await drag(page, (await screenOf(page, 'Kael'))!, (await screenOf(page, 'Ankunft in Velmar'))!, 'Kael nimmt teil an „Ankunft in Velmar“')
  await page.waitForTimeout(300)
  await expect(panel(page)).toBeHidden()
})

test('Nach einer neuen Beziehung ist die gezogene Person ausgewählt', async ({ page }) => {
  await page.keyboard.press('2')
  await settle(page)
  await drag(page, (await screenOf(page, 'Kael'))!, (await screenOf(page, 'Anna'))!)
  await page.getByRole('textbox', { name: 'Kael → Anna' }).fill('liebt')
  await page.keyboard.press('Enter')
  await expect(panel(page).getByRole('button', { name: 'Name bearbeiten' })).toHaveText('Kael')
  await expect(panel(page).getByRole('region', { name: 'Verlauf' })).toContainText('→ Anna liebt')
})

test('Suche verliert beim sofortigen Tippen keinen Buchstaben', async ({ page }) => {
  await page.keyboard.press('Control+K')
  await page.keyboard.type('Anna')
  await expect(page.getByPlaceholder(/Person, Gruppe, Ort/)).toHaveValue('Anna')
})

test('Klick auf eine Ebene springt dorthin und zeigt den Zeitpunkt rechts', async ({ page }) => {
  await page.getByRole('button', { name: /^2\. / }).click()
  await expect(page.getByRole('button', { name: 'Zeitpunkt bearbeiten' })).toHaveText(/^2\. /)
  await expect(panel(page)).toContainText('Zeitpunkt 2')
})
