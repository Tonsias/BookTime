import { expect, test, type Page } from '@playwright/test'
import { open, panel, ready, saved, search } from './helpers'

let problems: string[] = []

test.beforeEach(async ({ page }) => {
  problems = await open(page)
})

test.afterEach(() => {
  expect(problems, 'Konsolenfehler oder -warnungen').toEqual([])
})

const age = (page: Page) => panel(page).locator('.kv-row').filter({ has: page.getByText('Alter', { exact: true }) })

test('Geburtsdatum ändern zeigt das Alter zum aktuellen Zeitpunkt', async ({ page }) => {
  await search(page, 'Anna')
  await expect(age(page)).toContainText('22 Jahre')
  await panel(page).getByRole('combobox', { name: 'Monat' }).selectOption({ label: 'Frostmond' })
  await expect(age(page)).toContainText('23 Jahre')
  await panel(page).getByRole('textbox', { name: 'Tag' }).fill('')
  await panel(page).getByRole('textbox', { name: 'Tag' }).press('Enter')
  await expect(age(page)).toContainText('ca. 23 Jahre')
})

test('Datum am Zeitpunkt entfernen blendet das Alter aus', async ({ page }) => {
  await page.getByRole('button', { name: 'Zeitpunkt bearbeiten' }).click()
  const year = panel(page).getByRole('textbox', { name: 'Jahr' })
  await expect(year).toHaveValue('412')
  await year.fill('')
  await year.press('Enter')
  await year.blur()
  await expect(page.locator('.timebar')).not.toContainText('Saatmond')
  await search(page, 'Anna')
  await expect(panel(page).locator('.kv-row', { hasText: 'Geboren' })).toBeVisible()
  await expect(age(page)).toHaveCount(0)
})

test('Kalender-Seite: Monat umbenennen wirkt in der Buchansicht, genutzte Monate bleiben', async ({ page }) => {
  await page.goto('kalender.html')
  const name = page.getByRole('textbox', { name: 'Name des Monats' }).nth(1)
  await expect(name).toHaveValue('Saatmond')
  await name.fill('Grünmond')
  await name.press('Enter')
  await page.getByRole('button', { name: 'entfernen' }).nth(1).click()
  await expect(page.getByText('Grünmond wird von 2 Daten genutzt und lässt sich nicht entfernen.')).toBeVisible()
  await saved(page)
  await page.goto('./')
  await ready(page)
  await expect(page.locator('.timebar')).toContainText('14. Grünmond 412 Z.')
})
