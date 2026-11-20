import { expect, test } from '@playwright/test'
import { mockSupabase, openFilters, signIn } from './supabase-mock'

test('oturum açılmadan çalışma alanı gösterilmez', async ({ context, page }) => {
  await mockSupabase(context)
  await page.goto('/payments')
  await expect(page).toHaveURL('/giris')
  await expect(page.getByRole('heading', { name: 'Hoş geldiniz' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toHaveCount(0)
})

test('üretim çıktısında tablo ve gezinme ekran boyutuna uyum sağlar', async ({ context, page, isMobile }) => {
  await mockSupabase(context)
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Ödemeler', level: 1 })).toBeVisible()

  const menu = page.getByRole('navigation', { name: 'Ana menü' })
  if (isMobile) {
    await expect(menu).toBeHidden()
    await page.getByRole('button', { name: 'Menüyü aç' }).click()
    await expect(menu).toBeVisible()
  } else {
    await expect(menu).toBeVisible()
  }

  await expect(menu.getByRole('link')).toHaveText(['Genel Bakış', 'Ödemeler', 'Firmalar'])
  const settings = menu.getByRole('button', { name: 'Ayarlar' })
  await expect(settings).toBeVisible()
  await expect(settings).toBeDisabled()
  await settings.click({ force: true })
  await expect(page).toHaveURL('/payments')

  await menu.getByRole('link', { name: 'Genel Bakış' }).click()
  await expect(page.getByRole('heading', { name: 'Genel Bakış', level: 1 })).toBeVisible()
  if (isMobile) await expect(menu).toBeHidden()

  if (isMobile) await page.getByRole('button', { name: 'Menüyü aç' }).click()
  await menu.getByRole('link', { name: 'Firmalar' }).click()
  await expect(page).toHaveURL('/firms')
  await expect(page.getByRole('heading', { name: 'Henüz firma kaydı yok' })).toBeVisible()
  if (isMobile) await page.getByRole('button', { name: 'Menüyü aç' }).click()
  const payments = menu.getByRole('link', { name: 'Ödemeler' })
  await payments.focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(menu.locator(':focus')).toHaveCount(0)
  await payments.click()
  await expect(page).toHaveURL('/payments')
  const pageFits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  expect(pageFits).toBe(true)
  const tableRegion = page.getByRole('region', { name: 'Yatay kaydırılabilir ödeme tablosu' })
  await expect(tableRegion).toBeVisible()
  if (isMobile) {
    expect(await tableRegion.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
  }

  await expect(page.getByText('Test modu')).toHaveCount(0)
  await openFilters(page, isMobile)
  await expect(page.getByRole('combobox', { name: 'Para birimi' })).toHaveValue('TRY')
})
