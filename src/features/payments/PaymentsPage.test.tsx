import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PaymentsPage } from './PaymentsPage'
import { PaymentsProvider } from './PaymentsProvider'

const userId = '00000000-0000-4000-8000-000000000001'
const organizationId = '00000000-0000-4000-8000-000000000011'
const departmentId = '00000000-0000-4000-8000-000000000021'

type Call = [string, ...unknown[]]
type Response = { data: unknown; error: { code: string } | null; count?: number }
type Handler = (table: string, calls: Call[]) => Response

const row = (overrides: Record<string, unknown> = {}) => ({
  id: '00000000-0000-4000-8000-000000000031', organization_id: organizationId, department_id: departmentId,
  detail: 'Kira', payment_type: 'rent', amount: '999999999999.99', currency: 'TRY', due_on: null, paid_on: null,
  notes: null, status: 'unpaid', revision: 1, created_at: '2026-11-19T10:00:00.123456+00:00', updated_at: '2026-11-19T10:00:00+00:00',
  ...overrides,
})

function workspace(role: 'editor' | 'viewer', rows: unknown[] = [row()], count = rows.length): Handler {
  return (table) => ({
    departments: { data: [{ id: departmentId, organization_id: organizationId, name: 'Finans' }], error: null },
    organization_memberships: { data: [{ organization_id: organizationId, role: 'member' }], error: null },
    department_memberships: { data: [{ department_id: departmentId, role }], error: null },
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
      'Ödeme Detayı', 'Ödeme Türü', 'Tutar', 'Vade Tarihi', 'Gerçekleşen Ödeme Tarihi', 'Açıklama', 'Durum',
    ])
    expect(within(table).getByText('999.999.999.999,99 TL')).toBeVisible()
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

  it('sunucu satır sınırı kayıtları kestiğinde eksik tablo göstermez', async () => {
    renderPage(workspace('editor', [row()], 2))

    expect(await screen.findByRole('heading', { name: 'Ödemeler yüklenemedi' })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('Tüm ödeme kayıtları yüklenemedi')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('yeni ödemeyi ondalık metin ve departman kapsamıyla kaydeder', async () => {
    const user = userEvent.setup()
    const base = workspace('editor', [])
    const { requests } = renderPage((table, calls) => isWrite(calls)
      ? { data: row({ id: '00000000-0000-4000-8000-000000000032', detail: 'Elektrik', payment_type: 'invoice', amount: '12.50' }), error: null }
      : base(table, calls))

    await user.click(await screen.findByRole('button', { name: 'Ödeme Ekle' }))
    const form = within(screen.getByRole('form', { name: 'Ödeme formu' }))
    expect(form.getByLabelText('Departman')).toHaveValue(departmentId)
    await user.type(form.getByLabelText('Ödeme detayı'), 'Elektrik')
    await user.type(form.getByLabelText(/Tutar/), '12,5')
    await user.click(form.getByRole('button', { name: 'Ödemeyi kaydet' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Ödeme kaydedildi.')
    expect(screen.getByRole('table')).toHaveTextContent('12,50 TL')
    const insert = requests.find(({ calls }) => isWrite(calls))?.calls.find(([method]) => method === 'insert')
    expect(insert?.[1]).toMatchObject({ organization_id: organizationId, department_id: departmentId, amount: '12.50', due_on: null, notes: null })
  })

  it('eski revizyonla düzenlemede başarı göstermez, girdiyi korur ve listeyi yeniler', async () => {
    const user = userEvent.setup()
    const base = workspace('editor')
    const { requests } = renderPage((table, calls) => isWrite(calls) ? { data: [], error: null } : base(table, calls))

    const [edit] = await screen.findAllByRole('button', { name: 'Ödemeyi düzenle: Kira' })
    await user.click(edit!)
    const form = within(screen.getByRole('form', { name: 'Ödeme formu' }))
    await user.type(form.getByLabelText('Açıklama'), 'yeni not')
    await user.click(form.getByRole('button', { name: 'Değişiklikleri kaydet' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('başka bir kullanıcı tarafından değiştirilmiş')
    expect(screen.queryByRole('status', { name: /güncellendi/ })).not.toBeInTheDocument()
    expect(await screen.findByLabelText('Açıklama')).toHaveValue('yeni not')
    const update = requests.find(({ calls }) => isWrite(calls))?.calls
    expect(update).toContainEqual(['eq', 'revision', 1])
    expect(requests.filter(({ table, calls }) => table === 'payments' && !isWrite(calls))).toHaveLength(2)
  })
})
