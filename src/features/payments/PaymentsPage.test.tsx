import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PaymentsPage } from './PaymentsPage'
import { PaymentsProvider } from './PaymentsProvider'

const userId = '00000000-0000-4000-8000-000000000001'
const organizationId = '00000000-0000-4000-8000-000000000011'

type Call = [string, ...unknown[]]
type Response = { data: unknown; error: { code: string } | null; count?: number }
type Handler = (table: string, calls: Call[]) => Response

const row = (overrides: Record<string, unknown> = {}) => {
  const amount = overrides.amount ?? '999999999999.99'
  const status = overrides.status ?? 'unpaid'
  return ({
  id: '00000000-0000-4000-8000-000000000031', organization_id: organizationId,
  detail: 'Kira', payment_type: 'rent', payment_method: null, amount, remaining_amount: status === 'paid' ? '0.00' : amount, currency: 'TRY', due_on: null, paid_on: null,
  notes: null, status, revision: 1, created_at: '2026-11-19T10:00:00.123456+00:00', updated_at: '2026-11-19T10:00:00+00:00',
  ...overrides,
  })
}

function workspace(role: 'manager' | 'viewer' | null, rows: unknown[] = [row()], count = rows.length): Handler {
  return (table) => ({
    organizations: { data: [{ id: organizationId, name: 'Şirket' }], error: null },
    organization_memberships: { data: [{ organization_id: organizationId, role: 'member', payment_role: role }], error: null },
    payments: { data: rows, error: null, count },
  }[table] ?? { data: null, error: { code: 'unexpected' } })
}

function fakeClient(handler: Handler) {
  const requests: { table: string; calls: Call[] }[] = []
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: userId } } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
    from(table: string) {
      const request = { table, calls: [] as Call[] }
      requests.push(request)
      const builder: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'order', 'insert', 'update', 'delete', 'single']) {
        builder[method] = (...args: unknown[]) => { request.calls.push([method, ...args]); return builder }
      }
      builder.then = (resolve: (value: Response) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve().then(() => handler(table, request.calls)).then(resolve, reject)
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, requests }
}

function renderPage(handler: Handler) {
  const fake = fakeClient(handler)
  render(<PaymentsProvider client={fake.client}><PaymentsPage /></PaymentsProvider>)
  return fake
}

const isWrite = (calls: Call[]) => calls.some(([method]) => ['insert', 'update', 'delete'].includes(method))

afterEach(() => vi.restoreAllMocks())

describe('Supabase ödeme tablosu', () => {
  it('kesin tutarları ve istenen sütunları gösterir; görüntüleyiciye yazma yetkisi vermez', async () => {
    renderPage(workspace('viewer'))

    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Ödeme Detayı', 'Ödeme Türü', 'Ödeme Şekli', 'Tutar', 'Kalan', 'Vade Tarihi', 'Gerçekleşen Ödeme Tarihi', 'Açıklama', 'Durum',
    ])
    expect(within(table).getAllByText('999.999.999.999,99 TL')).toHaveLength(2)
    expect(within(table).getByText('Belirtilmedi')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Ödeme Ekle' })).toBeDisabled()
    expect(screen.getByText('Kayıt ekleme yetkiniz yok')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Ödemeyi düzenle/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ödemeyi sil/ })).not.toBeInTheDocument()
  })

  it('TL varsayılanını, EUR/USD seçimini ve filtrelerin sıfırlanmasını destekler', async () => {
    const user = userEvent.setup()
    renderPage(workspace('viewer'))

    const currency = await screen.findByRole('combobox', { name: 'Para birimi' })
    expect(currency).toHaveValue('TRY')
    await user.selectOptions(currency, 'EUR')
    await user.selectOptions(currency, 'USD')
    expect(currency).toHaveValue('USD')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Ödeme türü' }), 'tax')
    await user.type(screen.getByRole('searchbox', { name: 'Ödeme ara' }), 'aranan')
    await user.click(screen.getByRole('button', { name: 'Filtreleri temizle' }))

    expect(currency).toHaveValue('TRY')
    expect(screen.getByRole('combobox', { name: 'Ödeme türü' })).toHaveValue('')
    expect(screen.getByRole('searchbox', { name: 'Ödeme ara' })).toHaveValue('')
  })

  it('vade yılı ve ayına göre filtreler ve tarih filtrelerini sıfırlar', async () => {
    const user = userEvent.setup()
    renderPage(workspace('viewer', [
      row({ detail: 'Kasım 2025', due_on: '2025-11-30' }),
      row({ id: '00000000-0000-4000-8000-000000000032', detail: 'Kasım 2026', due_on: '2026-11-30' }),
      row({ id: '00000000-0000-4000-8000-000000000033', detail: 'Ekim 2025', due_on: '2025-10-30' }),
    ]))

    await screen.findByRole('table')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Vade yılı' }), '2025')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Vade ayı' }), '11')

    expect(screen.getByRole('table')).toHaveTextContent('Kasım 2025')
    expect(screen.getByRole('table')).not.toHaveTextContent('Kasım 2026')
    expect(screen.getByRole('table')).not.toHaveTextContent('Ekim 2025')

    await user.click(screen.getByRole('button', { name: 'Filtreleri temizle' }))
    expect(screen.getByRole('combobox', { name: 'Vade yılı' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Vade ayı' })).toHaveValue('')
  })

  it('ödeme rolü olmayan üyeyi kayıt eklemeye yetkili saymaz', async () => {
    renderPage(workspace(null, []))

    expect(await screen.findByRole('button', { name: 'Ödeme Ekle' })).toBeDisabled()
    expect(screen.getByText('Hesabınıza ödeme erişimi atanmamış. Yöneticinize başvurun.')).toBeVisible()
  })

  it('sunucu satır sınırı kayıtları kestiğinde eksik tablo göstermez', async () => {
    renderPage(workspace('manager', [row()], 2))

    expect(await screen.findByRole('heading', { name: 'Ödemeler yüklenemedi' })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('Tüm ödeme kayıtları yüklenemedi')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('yeni ödemeyi ondalık metin ve şirket kapsamıyla kaydeder', async () => {
    const user = userEvent.setup()
    const base = workspace('manager', [])
    const { requests } = renderPage((table, calls) => isWrite(calls)
      ? { data: row({ id: '00000000-0000-4000-8000-000000000032', detail: 'Elektrik', payment_type: 'invoice', payment_method: 'check', amount: '12.50' }), error: null }
      : base(table, calls))

    await user.click(await screen.findByRole('button', { name: 'Ödeme Ekle' }))
    expect(screen.getByRole('dialog', { name: 'Ödeme Ekle' })).toContainElement(screen.getByRole('form', { name: 'Ödeme formu' }))
    const form = within(screen.getByRole('form', { name: 'Ödeme formu' }))
    expect(screen.queryByLabelText('Departman')).not.toBeInTheDocument()
    await user.selectOptions(form.getByLabelText('Ödeme şekli'), 'check')
    await user.type(form.getByLabelText('Ödeme detayı'), 'Elektrik')
    await user.type(form.getByLabelText(/Tutar/), '12,5')
    await user.click(form.getByRole('button', { name: 'Ödemeyi kaydet' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Ödeme kaydedildi.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveTextContent('12,50 TL')
    const insert = requests.find(({ calls }) => isWrite(calls))?.calls.find(([method]) => method === 'insert')
    expect(insert?.[1]).toMatchObject({ organization_id: organizationId, payment_method: 'check', amount: '12.50', remaining_amount: '12.50', due_on: null, notes: null })
    expect(insert?.[1]).not.toHaveProperty('department_id')
  })

  it('ödeme penceresi iptal edilip yeniden açılabilir', async () => {
    const user = userEvent.setup()
    renderPage(workspace('manager', []))
    await user.click(await screen.findByRole('button', { name: 'Ödeme Ekle' }))
    const dialog = screen.getByRole('dialog', { name: 'Ödeme Ekle' })
    await user.type(within(dialog).getByLabelText('Ödeme detayı'), 'Taslak')
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ödeme Ekle' }))
    expect(screen.getByLabelText('Ödeme detayı')).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Vazgeç' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('kalan tutar ara değere düştüğünde kısmi durumu seçer; sıfırda durumu kendiliğinden değiştirmez', async () => {
    const user = userEvent.setup()
    renderPage(workspace('manager', []))

    await user.click(await screen.findByRole('button', { name: 'Ödeme Ekle' }))
    const form = within(screen.getByRole('form', { name: 'Ödeme formu' }))
    await user.type(form.getByLabelText(/Tutar/), '100')
    const remaining = form.getByLabelText(/Kalan/)
    expect(remaining).toHaveValue('100')

    await user.clear(remaining)
    await user.type(remaining, '20')
    const status = form.getByLabelText(/Durum/)
    expect(status).toHaveValue('partially_paid')

    await user.clear(remaining)
    await user.type(remaining, '0')
    expect(status).toHaveValue('partially_paid')
    await user.selectOptions(status, 'unpaid')
    expect(status).toHaveValue('unpaid')
    expect(remaining).toHaveValue('0')
  })

  it('birden fazla yetkili şirket varsa yeni kaydın şirketini seçtirir', async () => {
    const user = userEvent.setup()
    const secondId = '00000000-0000-4000-8000-000000000012'
    const base = workspace('manager', [])
    renderPage((table, calls) => {
      if (table === 'organizations') return { data: [{ id: organizationId, name: 'Birinci' }, { id: secondId, name: 'İkinci' }], error: null }
      if (table === 'organization_memberships') return { data: [
        { organization_id: organizationId, role: 'member', payment_role: 'manager' },
        { organization_id: secondId, role: 'member', payment_role: 'manager' },
      ], error: null }
      return base(table, calls)
    })

    await user.click(await screen.findByRole('button', { name: 'Ödeme Ekle' }))
    const company = screen.getByLabelText('Şirket')
    expect(company).toHaveValue('')
    await user.selectOptions(company, secondId)
    expect(company).toHaveValue(secondId)
  })

  it('eski revizyonla düzenlemede başarı göstermez, girdiyi korur ve listeyi yeniler', async () => {
    const user = userEvent.setup()
    const base = workspace('manager')
    const { requests } = renderPage((table, calls) => isWrite(calls) ? { data: [], error: null } : base(table, calls))

    const [edit] = await screen.findAllByRole('button', { name: 'Ödemeyi düzenle: Kira' })
    await user.click(edit!)
    const form = within(screen.getByRole('form', { name: 'Ödeme formu' }))
    await user.selectOptions(form.getByLabelText('Ödeme şekli'), 'bank')
    await user.type(form.getByLabelText('Açıklama'), 'yeni not')
    await user.click(form.getByRole('button', { name: 'Değişiklikleri kaydet' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('başka bir kullanıcı tarafından değiştirilmiş')
    expect(screen.getByRole('dialog', { name: 'Ödemeyi Düzenle' })).toContainElement(screen.getByRole('alert'))
    expect(screen.queryByRole('status', { name: /güncellendi/ })).not.toBeInTheDocument()
    expect(await screen.findByLabelText('Açıklama')).toHaveValue('yeni not')
    const update = requests.find(({ calls }) => isWrite(calls))?.calls
    expect(update).toContainEqual(['eq', 'revision', 1])
    expect(requests.filter(({ table, calls }) => table === 'payments' && !isWrite(calls))).toHaveLength(2)
  })
})
