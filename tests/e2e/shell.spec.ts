import { expect, test } from '@playwright/test'

test('üretim çıktısında tablo ve gezinme ekran boyutuna uyum sağlar', async ({ page, isMobile }) => {
  await page.goto('/payments')
  await expect(page.getByRole('heading', { name: 'Ödemeler', level: 1 })).toBeVisible()

  const menu = page.getByRole('navigation', { name: 'Ana menü' })
  if (isMobile) {
    await expect(menu).toBeHidden()
    await page.getByRole('button', { name: 'Menüyü aç' }).click()
    await expect(menu).toBeVisible()
  } else {
    await expect(menu).toBeVisible()
  }

  await menu.getByRole('link', { name: 'Ayarlar' }).click()
  await expect(page.getByRole('heading', { name: 'Ayarlar', level: 1 })).toBeVisible()
  if (isMobile) await expect(menu).toBeHidden()

  await page.goto('/payments')
  const pageFits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  expect(pageFits).toBe(true)
  const tableRegion = page.getByRole('region', { name: 'Yatay kaydırılabilir ödeme tablosu' })
  await expect(tableRegion).toBeVisible()
  if (isMobile) {
    expect(await tableRegion.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
  }

  await expect(page.getByRole('button', { name: 'Test Ödemesi Ekle' })).toBeDisabled()
  await expect(page.getByRole('combobox', { name: 'Para birimi' })).toHaveValue('TRY')
})
