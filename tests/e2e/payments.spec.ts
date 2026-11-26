import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockSupabase, openFilters, signIn } from './supabase-mock'

test.beforeEach(async ({ context, page }) => {
  await mockSupabase(context)
  await signIn(page)
})

async function addPayment(page: Page, detail: string, amount: string, currency: string, type: string, paid = false, dueOn = '') {
  await page.getByRole('button', { name: 'Ödeme Ekle' }).click()
  const form = page.getByRole('form', { name: 'Ödeme formu' })
  await form.locator('#payment-detail').fill(detail)
  await form.locator('#payment-amount').fill(amount)
  await form.locator('#payment-currency').selectOption(currency)
  await form.locator('#payment-type').selectOption(type)
  await form.locator('#payment-paymentMethod').selectOption('bank')
  if (dueOn) await form.locator('#payment-dueOn').fill(dueOn)
  if (paid) {
    await form.locator('#payment-status').selectOption('paid')
    await form.locator('#payment-paidOn').fill('18.11.2026')
  }
  await form.getByRole('button', { name: 'Ödemeyi kaydet' }).click()
  await expect(form).toBeHidden()
}

test('ödeme penceresi ve sağdaki yenile düğmesi çalışır', async ({ page }) => {
  const refresh = page.getByRole('button', { name: 'Yenile', exact: true })
  await expect(refresh).toHaveClass(/button-secondary/)
  await refresh.click()
  await expect(page.getByRole('table')).toBeVisible()

  const add = page.getByRole('button', { name: 'Ödeme Ekle', exact: true })
  await add.click()
  const dialog = page.getByRole('dialog', { name: 'Ödeme Ekle' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Ödeme detayı')).toBeFocused()
  await dialog.getByLabel('Ödeme detayı').fill('Taslak')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(add).toBeFocused()
  await add.click()
  await expect(dialog.getByLabel('Ödeme detayı')).toHaveValue('')
  await dialog.getByRole('button', { name: 'Vazgeç' }).click()
  await expect(dialog).toBeHidden()
})

test('mobil ödeme tablosu kompakt satırlar ve yatay kaydırma sunar', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobil tablo düzeni')
  await addPayment(page, 'Elektrik faturası', '100', 'TRY', 'invoice', false, '30.11.2026')
  await addPayment(page, 'Kira ödemesi', '200', 'TRY', 'rent')
  const region = page.getByRole('region', { name: 'Ödeme tablosu' })
  const rows = region.getByRole('row').filter({ has: page.getByRole('cell') })
  const record = rows.filter({ hasText: 'Elektrik faturası' })

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(rows).toHaveCount(2)
    expect((await record.boundingBox())!.height).toBeLessThanOrEqual(60)
    expect(await region.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  }

  await expect(page.getByText('Tüm sütunları ve işlemleri görmek için tabloyu yatay kaydırın.')).toBeVisible()
  await region.evaluate((element) => { element.scrollLeft = 0 })
  await region.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
  await expect(record.getByText('100,00 TL', { exact: true })).toHaveCount(2)
  await expect(record.getByText('30.11.2026')).toBeVisible()
  await expect(record.getByText('Ödenmedi', { exact: true })).toBeVisible()
  await expect(record.getByText('Muhasebe', { exact: true })).toBeVisible()
  const edit = record.getByRole('button', { name: 'Ödemeyi düzenle: Elektrik faturası' })
  const remove = record.getByRole('button', { name: 'Ödemeyi sil: Elektrik faturası' })
  expect((await edit.boundingBox())!.width).toBeGreaterThanOrEqual(44)
  expect((await remove.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await edit.click()
  await expect(page.getByRole('dialog', { name: 'Ödemeyi Düzenle' })).toBeVisible()
  await page.getByRole('button', { name: 'Vazgeç' }).click()
})

test('uzun ödeme değerleri farklı ekranlarda kesilmeden sığar', async ({ page, isMobile }) => {
  await addPayment(page, 'Uzun ödeme açıklaması denemesi', '999999999999,99', 'TRY', 'invoice', true, '30.11.2026')
  const initialList = page.getByRole('table')
  await initialList.getByRole('button', { name: 'Ödemeyi düzenle: Uzun ödeme açıklaması denemesi' }).click()
  const form = page.getByRole('form', { name: 'Ödeme formu' })
  await form.getByLabel('Açıklama').fill('Uzun açıklama ve çokuzunboşluksuzbirödemeaçıklaması')
  await form.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()

  for (const width of isMobile ? [320, 390] : [1024, 1250, 1251, 1280, 1366, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    const list = page.getByRole('table')
    await expect(list).toBeVisible()
    await expect(list.getByText('Uzun açıklama ve çokuzunboşluksuzbirödemeaçıklaması')).toBeVisible()
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(overflow.scrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width)
    const overflowingCell = await list.locator('th, td').evaluateAll((cells) =>
      cells.some((cell) => cell.scrollWidth > cell.clientWidth))
    expect(overflowingCell).toBe(false)
    if (width > 1250) {
      const region = page.getByRole('region', { name: 'Ödeme tablosu' })
      expect(await region.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    }
  }
})

test('vade tarihi tutardan sonra gösterilir ve gerçekleşen tarihten bağımsız saklanır', async ({ page }) => {
  await addPayment(page, 'Vadeli örnek', '10', 'TRY', 'invoice', true)
  const list = page.getByRole('table')
  const record = list.getByRole('row').filter({ hasText: 'Vadeli örnek' })
  await expect(record.getByText('Muhasebe', { exact: true })).toBeVisible()
  await record.getByRole('button', { name: 'Ödemeyi düzenle: Vadeli örnek' }).click()
  const form = page.getByRole('form', { name: 'Ödeme formu' })
  await form.locator('#payment-dueOn').fill('30.11.2026')
  await form.locator('#payment-status').selectOption('unpaid')
  await expect(form.locator('#payment-paidOn')).toHaveValue('')
  await expect(form.locator('#payment-dueOn')).toHaveValue('30.11.2026')
  await form.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
  await expect(form).toBeHidden()
  await page.reload()
  await expect(record.getByText('Muhasebe', { exact: true })).toBeVisible()
  const headings = list.getByRole('columnheader')
  await expect(headings.nth(2)).toHaveText('Ödeme Şekli')
  await expect(headings.nth(3)).toHaveText('Tutar')
  await expect(headings.nth(4)).toHaveText('Kalan')
  await expect(headings.nth(5)).toHaveText('Vade Tarihi')
  await expect(headings.nth(6)).toHaveText('Gerçekleşen Ödeme Tarihi')
  await expect(record.getByRole('cell').nth(5)).toHaveText('30.11.2026')
  await record.getByRole('button', { name: 'Ödemeyi düzenle: Vadeli örnek' }).click()
  await expect(form.locator('#payment-dueOn')).toHaveValue('30.11.2026')
})

test('yıl ve ay filtreleri vade tarihine göre birlikte çalışır', async ({ page, isMobile }) => {
  await addPayment(page, 'Kasım 2025', '10', 'TRY', 'invoice', false, '30.11.2025')
  await addPayment(page, 'Kasım 2026', '10', 'TRY', 'invoice', false, '30.11.2026')
  await addPayment(page, 'Ekim 2025', '10', 'TRY', 'invoice', false, '30.10.2025')

  const filters = page.getByRole('search', { name: 'Ödemeleri filtrele' })
  const list = page.getByRole('table')
  await openFilters(page, isMobile)
  await filters.getByRole('combobox', { name: 'Vade yılı' }).selectOption('2025')
  await filters.getByRole('combobox', { name: 'Vade ayı' }).selectOption('11')
  await expect(list.getByText('Kasım 2025', { exact: true })).toBeVisible()
  await expect(list.getByText('Kasım 2026', { exact: true })).toBeHidden()
  await expect(list.getByText('Ekim 2025', { exact: true })).toBeHidden()

  await page.getByRole('button', { name: 'Filtreleri temizle' }).click()
  await expect(list.getByText('Kasım 2026', { exact: true })).toBeVisible()
  await expect(list.getByText('Ekim 2025', { exact: true })).toBeVisible()
})

test('ödemeler kalıcıdır; düzenleme, filtreler, dashboard ve silme aynı veriyi kullanır', async ({ page, isMobile }) => {
  await addPayment(page, 'Örnek vergi', '0,10', 'TRY', 'tax', true)
  await addPayment(page, 'Örnek fatura', '0.20', 'TRY', 'invoice')
  await addPayment(page, 'Örnek kredi', '25', 'EUR', 'credit')
  await addPayment(page, 'Örnek döviz faturası', '7.50', 'USD', 'invoice', true)

  await page.reload()
  const list = page.getByRole('table')
  await expect(list.getByText('Örnek vergi', { exact: true })).toBeVisible()
  await expect(list.getByText('Örnek fatura', { exact: true })).toBeVisible()

  const filters = page.getByRole('search', { name: 'Ödemeleri filtrele' })
  await openFilters(page, isMobile)
  await filters.getByRole('combobox', { name: 'Durum', exact: true }).selectOption('paid')
  await expect(list.getByText('Örnek fatura', { exact: true })).toBeHidden()
  await filters.getByRole('combobox', { name: 'Durum', exact: true }).selectOption('')
  await filters.getByRole('combobox', { name: 'Ödeme türü', exact: true }).selectOption('invoice')
  await expect(list.getByText('Örnek vergi', { exact: true })).toBeHidden()
  await filters.getByRole('combobox', { name: 'Ödeme türü', exact: true }).selectOption('')
  await filters.getByRole('searchbox').fill('vergi')
  await expect(list.getByText('Örnek fatura', { exact: true })).toBeHidden()
  await page.getByRole('button', { name: 'Filtreleri temizle' }).click()

  await page.goto('/overview')
  const summary = page.getByRole('article', { name: 'TRY özeti' })
  await expect(summary.getByText('0,30 TL', { exact: true })).toBeVisible()
  await expect(summary.getByText('0,10 TL', { exact: true })).toBeVisible()
  await expect(summary.getByText('0,20 TL', { exact: true })).toBeVisible()
  await expect(page.getByRole('article', { name: 'EUR özeti' })).toContainText('25,00 EUR')
  await expect(page.getByRole('article', { name: 'USD özeti' })).toContainText('7,50 USD')
  await expect(page.getByRole('meter', { name: 'Fatura kayıt oranı' })).toHaveAttribute('value', '2')

  await page.getByRole('link', { name: 'Ödeme tablosuna git', exact: true }).click()
  await list.getByRole('button', { name: 'Ödemeyi düzenle: Örnek fatura', exact: true }).click()
  const form = page.getByRole('form', { name: 'Ödeme formu' })
  await form.locator('#payment-status').selectOption('paid')
  await form.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
  await expect(form.getByRole('alert')).toContainText('İşaretli alanları kontrol edin')
  await form.locator('#payment-paidOn').fill('18.11.2026')
  await form.locator('#payment-amount').fill('0,40')
  await form.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
  await expect(form).toBeHidden()
  await page.goto('/overview')
  await expect(summary.getByText('0,50 TL', { exact: true })).toHaveCount(2)
  await expect(summary.getByText('0,00 TL', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Ödeme tablosuna git', exact: true }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await list.getByRole('button', { name: 'Ödemeyi sil: Örnek vergi', exact: true }).click()
  await expect(list.getByText('Örnek vergi', { exact: true })).toBeHidden()
  await page.goto('/overview')
  await expect(summary.getByText('0,40 TL', { exact: true })).toHaveCount(2)

})

test('yeni ödeme türleri saklanır ve genel bakışta özetlenir', async ({ page, isMobile }) => {
  await addPayment(page, 'Maaş örneği', '100', 'TRY', 'salary', true)
  await addPayment(page, 'Sigorta örneği', '200', 'TRY', 'insurance')
  await addPayment(page, 'Kira örneği', '50', 'EUR', 'rent', true)
  await addPayment(page, 'Diğer örnek', '25', 'TRY', 'other')
  await page.reload()

  const filters = page.getByRole('search', { name: 'Ödemeleri filtrele' })
  const list = page.getByRole('table')
  await openFilters(page, isMobile)
  await filters.getByRole('combobox', { name: 'Ödeme türü' }).selectOption({ label: 'Diğer' })
  await expect(list.getByText('Diğer örnek', { exact: true })).toBeVisible()
  await expect(list.getByText('Maaş örneği', { exact: true })).toBeHidden()

  await page.goto('/overview')
  const statuses = page.getByRole('region', { name: 'Kayıt durumları' })
  await expect(statuses.getByText('Toplam kayıt', { exact: true }).locator('..')).toHaveText('Toplam kayıt4')
  await expect(statuses.getByText('Ödenen kayıt', { exact: true }).locator('..')).toHaveText('Ödenen kayıt2')
  await expect(statuses.getByText('Ödenmeyen kayıt', { exact: true }).locator('..')).toHaveText('Ödenmeyen kayıt2')
  const trySummary = page.getByRole('article', { name: 'TRY özeti' })
  await expect(trySummary.getByText('%30,8', { exact: true })).toBeVisible()
  await expect(trySummary.locator('time')).toHaveText('18.11.2026')
  await expect(page.getByRole('article', { name: 'EUR özeti' }).getByText('%100', { exact: true })).toBeVisible()
  await expect(page.getByRole('article', { name: 'USD özeti' }).locator('time')).toHaveCount(0)
  for (const type of ['Maaş', 'Sigorta', 'Kira', 'Diğer']) {
    await expect(page.getByRole('meter', { name: `${type} kayıt oranı` })).toHaveAttribute('value', '1')
  }
})

test('kalan tutar kısmi durumu seçer; sıfırda durum kullanıcı seçimine bağlı kalır', async ({ page }) => {
  await addPayment(page, 'Kısmi ödeme örneği', '100', 'TRY', 'invoice')
  const list = page.getByRole('table')
  const record = list.getByRole('row').filter({ hasText: 'Kısmi ödeme örneği' })

  await record.getByRole('button', { name: 'Ödemeyi düzenle: Kısmi ödeme örneği' }).click()
  const form = page.getByRole('form', { name: 'Ödeme formu' })
  await form.locator('#payment-remainingAmount').fill('20')
  await expect(form.locator('#payment-status')).toHaveValue('partially_paid')
  await form.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
  await expect(form).toBeHidden()
  await expect(record.getByText('Kısmen Ödendi', { exact: true })).toBeVisible()

  await page.goto('/overview')
  const summary = page.getByRole('article', { name: 'TRY özeti' })
  await expect(summary.getByText('80,00 TL', { exact: true })).toBeVisible()
  await expect(summary.getByText('20,00 TL', { exact: true })).toBeVisible()
  const statuses = page.getByRole('region', { name: 'Kayıt durumları' })
  await expect(statuses.getByText('Kısmen ödenen kayıt', { exact: true }).locator('..')).toHaveText('Kısmen ödenen kayıt1')

  await page.getByRole('link', { name: 'Ödeme tablosuna git', exact: true }).click()
  await record.getByRole('button', { name: 'Ödemeyi düzenle: Kısmi ödeme örneği' }).click()
  await form.locator('#payment-remainingAmount').fill('0')
  await expect(form.locator('#payment-status')).toHaveValue('partially_paid')
  await form.locator('#payment-status').selectOption('unpaid')
  await form.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
  await expect(form).toBeHidden()
  await expect(record.getByText('Ödenmedi', { exact: true })).toBeVisible()
})

test('başka oturumda güncellenen kaydın üzerine eski düzenleme yazılmaz', async ({ page, context }) => {
  await addPayment(page, 'İki sekmeli örnek', '10', 'TRY', 'invoice')
  const list = page.getByRole('table')
  await list.getByRole('button', { name: 'Ödemeyi düzenle: İki sekmeli örnek', exact: true }).click()
  const staleForm = page.getByRole('form', { name: 'Ödeme formu' })
  await staleForm.locator('#payment-amount').fill('99')

  const otherPage = await context.newPage()
  await otherPage.goto('/payments')
  const otherList = otherPage.getByRole('table')
  await otherList.getByRole('button', { name: 'Ödemeyi düzenle: İki sekmeli örnek', exact: true }).click()
  const currentForm = otherPage.getByRole('form', { name: 'Ödeme formu' })
  await currentForm.locator('#payment-amount').fill('20')
  await currentForm.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
  const currentRecord = otherList.getByRole('row').filter({ hasText: 'İki sekmeli örnek' })
  await expect(currentRecord.getByRole('cell').nth(3)).toHaveText('20,00 TL')

  await staleForm.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
  await expect(page.getByRole('alert')).toContainText('başka bir kullanıcı tarafından değiştirilmiş')
  await expect(staleForm.locator('#payment-amount')).toHaveValue('99')
  await staleForm.getByRole('button', { name: 'Vazgeç' }).click()
  const staleRecord = list.getByRole('row').filter({ hasText: 'İki sekmeli örnek' })
  await expect(staleRecord.getByRole('cell').nth(3)).toHaveText('20,00 TL')
  await otherPage.close()
})
