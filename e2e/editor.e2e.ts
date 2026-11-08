import { expect, test } from '@playwright/test'
import { crc32, deflateSync } from 'node:zlib'
import { drag, emptySpot, insideOf, open, panel, ready, saved, screenOf, search, settle } from './helpers'

test.beforeEach(async ({ page }, info) => {
  const problems = await open(page)
  info.attach('konsole', { body: '' })
  test.info().annotations.push({ type: 'problems', description: '' })
  ;(page as unknown as { problems: string[] }).problems = problems
})

test.afterEach(async ({ page }) => {
  expect((page as unknown as { problems: string[] }).problems, 'Konsolenfehler oder -warnungen').toEqual([])
})

test('Name im Panel ändern, Rückgängig und nach dem Neuladen erhalten', async ({ page }) => {
  await search(page, 'Anna')
  const name = panel(page).getByRole('button', { name: 'Name bearbeiten' })
  await expect(name).toHaveText('Anna')
  await name.click()
  await page.getByRole('textbox', { name: 'Name' }).fill('Anna Velin')
  await page.keyboard.press('Enter')
  await expect(panel(page).getByRole('button', { name: 'Name bearbeiten' })).toHaveText('Anna Velin')
  await expect(page.locator('.scene-label', { hasText: 'Anna Velin' })).toBeVisible()

  await page.keyboard.press('Control+Z')
  await expect(panel(page).getByRole('button', { name: 'Name bearbeiten' })).toHaveText('Anna')
  await expect(page.getByText('Rückgängig: Name geändert')).toBeVisible()
  await page.keyboard.press('Control+Y')
  await expect(panel(page).getByRole('button', { name: 'Name bearbeiten' })).toHaveText('Anna Velin')

  await saved(page)
  await page.reload()
  await ready(page)
  await expect(page.locator('.scene-label', { hasText: 'Anna Velin' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Änderung/ })).toBeVisible()
})

test('Esc verwirft, Tab übernimmt und geht zum nächsten Feld', async ({ page }) => {
  await search(page, 'Ben')
  await panel(page).getByRole('button', { name: 'Name bearbeiten' }).click()
  await page.getByRole('textbox', { name: 'Name' }).fill('Verworfen')
  await page.keyboard.press('Escape')
  await expect(panel(page).getByRole('button', { name: 'Name bearbeiten' })).toHaveText('Ben')
  await expect(panel(page)).toBeVisible()

  await panel(page).getByRole('button', { name: 'Name bearbeiten' }).click()
  await page.getByRole('textbox', { name: 'Name' }).fill('Benedikt')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('textbox', { name: 'Beschreibung' })).toBeFocused()
  await page.keyboard.type(' Ergänzt.')
  await page.keyboard.press('Control+Enter')
  await expect(panel(page).getByRole('button', { name: 'Name bearbeiten' })).toHaveText('Benedikt')
  await expect(panel(page).getByText('Ergänzt.')).toBeVisible()
})

test('Person in der Szene auf einen Ort ziehen', async ({ page }) => {
  await page.keyboard.press('2')
  await settle(page)
  const anna = (await screenOf(page, 'Anna'))!
  const target = await insideOf(page, 'Wald von Ardun')
  await drag(page, anna, target, 'Anna → Wald von Ardun: Aufenthalt ab 1')
  await expect(panel(page).getByRole('button', { name: 'Name bearbeiten' })).toHaveText('Anna')
  await expect(panel(page).getByRole('region', { name: /^Stand/ })).toContainText('in Wald von Ardun')
})

test('Gerichtete Beziehung zeigt vom gezogenen zum Ziel', async ({ page }) => {
  await page.keyboard.press('2')
  await settle(page)
  await drag(page, (await screenOf(page, 'Kael'))!, (await screenOf(page, 'Anna'))!, 'Kael → Anna: Beziehung ab 1, Art wählen …')
  await page.getByRole('textbox', { name: 'Kael → Anna' }).fill('liebt')
  await page.keyboard.press('Enter')
  await search(page, 'Kael')
  await expect(panel(page).getByRole('region', { name: /^Stand/ })).toContainText('→ Anna')
  await search(page, 'Anna')
  await expect(panel(page).getByRole('region', { name: /^Stand/ })).toContainText('← Kael')
})

test('Doppelklick legt einen Ort an, der Name ist sofort editierbar', async ({ page }) => {
  await page.keyboard.press('2')
  await settle(page)
  const spot = await emptySpot(page)
  await page.mouse.dblclick(spot.x, spot.y)
  const input = page.getByRole('textbox', { name: 'Name' })
  await expect(input).toBeFocused()
  await page.keyboard.type('Hafen')
  await page.keyboard.press('Enter')
  await expect(page.locator('.scene-label', { hasText: 'Hafen' })).toBeVisible()
  await expect(panel(page).getByText('Ort', { exact: true })).toBeVisible()
})

test('Neue Person aus der Leiste „Ohne Ort“ auf einen Ort ziehen', async ({ page }) => {
  await page.keyboard.press('2')
  await settle(page)
  await page.keyboard.press('n')
  await page.keyboard.press('p')
  await expect(page.getByRole('textbox', { name: 'Name' })).toBeFocused()
  await page.keyboard.type('Lio')
  await page.keyboard.press('Enter')
  const chip = page.locator('.tray-chip', { hasText: 'Lio' })
  await expect(chip).toBeVisible()
  const box = (await chip.boundingBox())!
  await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, await insideOf(page, 'Velmar'), 'Lio → Velmar: Aufenthalt ab 1')
  await expect(chip).toHaveCount(0)
  await expect(page.locator('.scene-label', { hasText: 'Lio' })).toBeVisible()
})

test('Löschen mit Abhängigkeiten fragt nach und lässt sich rückgängig machen', async ({ page }) => {
  await search(page, 'Anna')
  await page.keyboard.press('Delete')
  const dialog = page.locator('[role=dialog]', { hasText: 'Anna löschen?' })
  await expect(dialog).toContainText('Aufenthalt')
  await dialog.getByRole('button', { name: 'Löschen' }).click()
  await expect(page.locator('.scene-label', { hasText: /^Anna$/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).last().click()
  await expect(page.locator('.scene-label', { hasText: /^Anna$/ })).toBeVisible()
})

test('Hinweise im Dialog auflösen und als gewollt markieren', async ({ page }) => {
  await search(page, 'Anna')
  const end = panel(page).getByRole('slider', { name: 'Existenz: Ende' })
  await end.focus()
  for (let k = 0; k < 3; k++) await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('button', { name: /Hinweise? auflösen/ })).toBeVisible()
  await page.getByRole('button', { name: /Hinweise? auflösen/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Hinweis auflösen' })
  await expect(dialog).toContainText('Hinweis 1 von')
  await expect(dialog).toContainText('außerhalb der Existenz von Anna')

  await page.keyboard.press('g')
  await page.getByRole('textbox', { name: 'Begründung' }).fill('Anna spukt')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Als gewollt markiert').first()).toBeVisible()

  for (let k = 0; k < 20 && !(await page.getByText('Alle Hinweise erledigt').isVisible()); k++) {
    await page.keyboard.press('1')
    await page.waitForTimeout(100)
  }
  await expect(page.getByText('Alle Hinweise erledigt')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Buch bearbeiten' }).click()
  await expect(panel(page)).toContainText('Anna spukt')
})

test('Zeitpunkt einfügen, benennen und mit den Pfeiltasten wechseln', async ({ page }) => {
  await page.getByRole('button', { name: 'Zeitpunkt einfügen' }).click()
  await expect(page.getByRole('textbox', { name: 'Name' })).toBeFocused()
  await page.keyboard.type('Zwischenspiel')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Zeitpunkt bearbeiten' })).toHaveText('2. Zwischenspiel')
  await page.locator('body').click({ position: { x: 5, y: 500 } })
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('button', { name: 'Zeitpunkt bearbeiten' })).toHaveText(/^1\. /)
})

test('Bild hochladen bleibt nach dem Neuladen', async ({ page }) => {
  await search(page, 'Mira')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  await panel(page).getByTestId('image-input').setInputFiles({ name: 'mira.png', mimeType: 'image/png', buffer: png })
  await expect(panel(page).getByRole('button', { name: /Bild images\/mira-\w{4}\.png/ })).toBeVisible()
  await expect(panel(page).getByRole('img', { name: 'Mira', exact: true })).toBeVisible()
  await saved(page)
  await page.reload()
  await ready(page)
  await search(page, 'Mira')
  await expect(panel(page).getByRole('img', { name: 'Mira', exact: true })).toBeVisible()
})

/** Einfarbiges PNG in beliebiger Größe */
function png(width: number, height: number) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), body.length + 4)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  const rows = Buffer.alloc((width + 1) * height)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}

test('Die Ebene übernimmt die Form eines hochgeladenen Hintergrunds', async ({ page }) => {
  await page.keyboard.press('2')
  await settle(page)
  await page.getByRole('button', { name: 'Zeitpunkt bearbeiten' }).click()
  await panel(page).getByTestId('image-input').setInputFiles({ name: 'kueste.png', mimeType: 'image/png', buffer: png(2000, 500) })
  await expect(panel(page).getByRole('button', { name: 'Breite bearbeiten' })).toHaveText('40')
  await settle(page)
  const wide = await page.evaluate(() => window.__booktime!.net(18, 0))
  await page.mouse.dblclick(wide!.x, wide!.y)
  await expect(page.getByRole('textbox', { name: 'Name' })).toBeFocused()
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => window.__booktime!.hit(0, 7))).toBeNull()
  const above = await page.evaluate(() => window.__booktime!.net(0, 7))
  await page.mouse.dblclick(above!.x, above!.y)
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveCount(0)
})
