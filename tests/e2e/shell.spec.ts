import { expect, test } from '@playwright/test'
import { mockSupabase, openFilters, signIn } from './supabase-mock'

test('oturum açılmadan çalışma alanı gösterilmez', async ({ context, page }) => {
  await mockSupabase(context)
  await page.goto('/payments')
  await expect(page).toHaveURL('/giris')
  await expect(page.getByRole('heading', { name: 'Hoş geldiniz' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toHaveCount(0)
})

test('Kasa Defteri salt okunur olarak masaüstünde ve mobilde açılır', async ({ context, page, isMobile }) => {
  await mockSupabase(context)
  await signIn(page)
  const menu = page.getByRole('navigation', { name: 'Ana menü' })
  if (isMobile) await page.getByRole('button', { name: 'Menüyü aç' }).click()
  await menu.getByRole('link', { name: 'Kasa Defteri' }).click()
  await expect(page).toHaveURL('/cashbook')
  await expect(page.getByRole('heading', { name: 'Kasa Defteri', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Kayıt ekle' })).toBeDisabled()
  await expect(page.getByRole('table', { name: 'Kasa hareketleri' }).getByRole('columnheader')).toHaveText([
    'Tarih', 'Açıklama', 'İşlem Türü', 'Borç (Giren)', 'Alacak (Çıkan)',
  ])
  await expect(page.getByRole('heading', { name: 'Henüz kasa kaydı yok' })).toBeVisible()
  const balanceSummary = page.getByRole('region', { name: 'Seçilen ayın kasa özeti' })
  await expect(balanceSummary.getByRole('heading', { name: 'Kasım 2026 — Güncel Bakiye' })).toBeVisible()
  await expect(balanceSummary.getByText('0,00 TL')).toHaveCount(3)
  const tableTop = await page.locator('.cashbook').evaluate((element) => element.getBoundingClientRect().top)
  expect(tableTop).toBeLessThanOrEqual(isMobile ? 520 : 330)
  await expect(page.getByRole('columnheader', { name: 'Tarih', exact: true })).toBeInViewport()
  expect(await page.locator('#main-content').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  const cashbookRegion = page.getByRole('region', { name: 'Yatay kaydırılabilir kasa defteri tablosu' })
  await cashbookRegion.focus()
  await expect(cashbookRegion).toBeFocused()
  if (isMobile) {
    await expect(menu).toBeHidden()
    expect(await cashbookRegion.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
  }
  const monthBar = page.getByRole('navigation', { name: 'Kasa defteri ayları' })
  await expect(monthBar.getByRole('button')).toHaveCount(14)
  await expect(monthBar.getByRole('button', { name: 'Kasım 2026' })).toHaveAttribute('aria-pressed', 'true')
  expect(await monthBar.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
  await monthBar.getByRole('button', { name: 'Aralık 2027' }).click()
  await expect(page.getByRole('heading', { name: 'Aralık 2027 — Kasa hareketleri' })).toBeVisible()
  await expect(balanceSummary.getByRole('heading', { name: 'Aralık 2027 — Güncel Bakiye' })).toBeVisible()
  await monthBar.getByRole('button', { name: 'Ocak 2027' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Ocak 2027 — Kasa hareketleri' })).toBeVisible()
  await expect(balanceSummary.getByRole('heading', { name: 'Ocak 2027 — Güncel Bakiye' })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  expect(await monthBar.evaluate((element) => element.getBoundingClientRect().bottom === window.innerHeight)).toBe(true)
  await expect(monthBar.getByRole('button', { name: 'Ocak 2027' })).toBeInViewport()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Kasa Defteri', level: 1 })).toBeVisible()
  await expect(monthBar.getByRole('button', { name: 'Kasım 2026' })).toHaveAttribute('aria-pressed', 'true')
})

test('kasa defteri kaydırılırken masaüstü menüsü sabit ve erişilebilir kalır', async ({ context, page, isMobile }) => {
  test.skip(isMobile, 'Masaüstü yan menüsü için')
  await page.setViewportSize({ width: 1100, height: 600 })
  await mockSupabase(context)
  const entries = Array.from({ length: 25 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    organization_id: '00000000-0000-4000-8000-000000000011',
    entry_on: '2026-11-24', description: `Kasa kaydı ${index + 1}`, entry_type: 'Gelen Para',
    incoming: '1.00', outgoing: '0.00', revision: 1,
    created_at: '2026-11-24T00:00:00Z', updated_at: '2026-11-24T00:00:00Z',
  }))
  await context.route('**/rest/v1/cashbook_entries**', (route) => route.fulfill({
    json: entries, headers: {
      'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range',
      'content-range': `0-${entries.length - 1}/${entries.length}`,
    },
  }))
  await signIn(page)
  await page.goto('/cashbook')
  await expect(page.getByText('Kasa kaydı 1', { exact: true })).toBeVisible()

  const sidebar = page.locator('#primary-navigation')
  const initialTop = await sidebar.evaluate((element) => element.getBoundingClientRect().top)
  await page.mouse.move(900, 400)
  await page.mouse.wheel(0, 1000)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  expect(await sidebar.evaluate((element) => element.getBoundingClientRect().top)).toBe(initialTop)
  expect(await sidebar.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  await sidebar.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await expect(sidebar.getByRole('button', { name: 'Ayarlar' })).toBeInViewport()
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

  await expect(menu.getByRole('link')).toHaveText(['Genel Bakış', 'Ödemeler', 'Kasa Defteri', 'Firmalar'])
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
  await menu.getByRole('link', { name: 'Firmalar' }).focus()
  await page.keyboard.press('Tab')
  await expect(menu.locator(':focus')).toHaveCount(0)
  await menu.getByRole('link', { name: 'Ödemeler' }).click()
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
