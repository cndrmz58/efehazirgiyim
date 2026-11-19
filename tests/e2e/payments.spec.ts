import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockSupabase, signIn } from './supabase-mock'

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

test('vade tarihi tutardan sonra gösterilir ve gerçekleşen tarihten bağımsız saklanır', async ({ page, isMobile }) => {
  await addPayment(page, 'Vadeli örnek', '10', 'TRY', 'invoice', true)
  const list = isMobile ? page.getByLabel('Mobil ödeme listesi') : page.getByRole('table')
  const record = list.getByRole(isMobile ? 'article' : 'row').filter({ hasText: 'Vadeli örnek' })
  await record.getByRole('button', { name: 'Ödemeyi düzenle: Vadeli örnek' }).click()
  const form = page.getByRole('form', { name: 'Ödeme formu' })
  await form.locator('#payment-dueOn').fill('30.11.2026')
  await form.locator('#payment-status').selectOption('unpaid')
  await expect(form.locator('#payment-paidOn')).toHaveValue('')
  await expect(form.locator('#payment-dueOn')).toHaveValue('30.11.2026')
  await form.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
  await expect(form).toBeHidden()
  await page.reload()
  if (!isMobile) {
    const headings = list.getByRole('columnheader')
    await expect(headings.nth(2)).toHaveText('Ödeme Şekli')
    await expect(headings.nth(3)).toHaveText('Tutar')
    await expect(headings.nth(4)).toHaveText('Kalan')
    await expect(headings.nth(5)).toHaveText('Vade Tarihi')
    await expect(headings.nth(6)).toHaveText('Gerçekleşen Ödeme Tarihi')
    await expect(record.getByRole('cell').nth(5)).toHaveText('30.11.2026')
  } else {
    await expect(record.getByText('Vade Tarihi', { exact: true }).locator('..')).toContainText('30.11.2026')
  }
  await record.getByRole('button', { name: 'Ödemeyi düzenle: Vadeli örnek' }).click()
  await expect(form.locator('#payment-dueOn')).toHaveValue('30.11.2026')
})

test('yıl ve ay filtreleri vade tarihine göre birlikte çalışır', async ({ page, isMobile }) => {
  await addPayment(page, 'Kasım 2025', '10', 'TRY', 'invoice', false, '30.11.2025')
  await addPayment(page, 'Kasım 2026', '10', 'TRY', 'invoice', false, '30.11.2026')
  await addPayment(page, 'Ekim 2025', '10', 'TRY', 'invoice', false, '30.10.2025')

  const filters = page.getByRole('search', { name: 'Ödemeleri filtrele' })
  const list = isMobile ? page.getByLabel('Mobil ödeme listesi') : page.getByRole('table')
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
  const list = isMobile ? page.getByLabel('Mobil ödeme listesi') : page.getByRole('table')
  await expect(list.getByText('Örnek vergi', { exact: true })).toBeVisible()
  await expect(list.getByText('Örnek fatura', { exact: true })).toBeVisible()

  const filters = page.getByRole('search', { name: 'Ödemeleri filtrele' })
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
  const list = isMobile ? page.getByLabel('Mobil ödeme listesi') : page.getByRole('table')
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

test('kalan tutar kısmi durumu seçer; sıfırda durum kullanıcı seçimine bağlı kalır', async ({ page, isMobile }) => {
  await addPayment(page, 'Kısmi ödeme örneği', '100', 'TRY', 'invoice')
  const list = isMobile ? page.getByLabel('Mobil ödeme listesi') : page.getByRole('table')
  const record = list.getByRole(isMobile ? 'article' : 'row').filter({ hasText: 'Kısmi ödeme örneği' })

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

test('başka oturumda güncellenen kaydın üzerine eski düzenleme yazılmaz', async ({ page, context, isMobile }) => {
  await addPayment(page, 'İki sekmeli örnek', '10', 'TRY', 'invoice')
  const list = isMobile ? page.getByLabel('Mobil ödeme listesi') : page.getByRole('table')
  await list.getByRole('button', { name: 'Ödemeyi düzenle: İki sekmeli örnek', exact: true }).click()
  const staleForm = page.getByRole('form', { name: 'Ödeme formu' })
  await staleForm.locator('#payment-amount').fill('99')

  const otherPage = await context.newPage()
  await otherPage.goto('/payments')
  const otherList = isMobile ? otherPage.getByLabel('Mobil ödeme listesi') : otherPage.getByRole('table')
  await otherList.getByRole('button', { name: 'Ödemeyi düzenle: İki sekmeli örnek', exact: true }).click()
  const currentForm = otherPage.getByRole('form', { name: 'Ödeme formu' })
  await currentForm.locator('#payment-amount').fill('20')
  await currentForm.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
  const currentRecord = otherList.getByRole(isMobile ? 'article' : 'row').filter({ hasText: 'İki sekmeli örnek' })
  await expect(isMobile ? currentRecord.locator('.mobile-amount') : currentRecord.getByRole('cell').nth(3)).toHaveText('20,00 TL')

  await staleForm.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
  await expect(page.getByRole('alert')).toContainText('başka bir kullanıcı tarafından değiştirilmiş')
  await expect(staleForm.locator('#payment-amount')).toHaveValue('99')
  const staleRecord = list.getByRole(isMobile ? 'article' : 'row').filter({ hasText: 'İki sekmeli örnek' })
  await expect(isMobile ? staleRecord.locator('.mobile-amount') : staleRecord.getByRole('cell').nth(3)).toHaveText('20,00 TL')
  await otherPage.close()
})
