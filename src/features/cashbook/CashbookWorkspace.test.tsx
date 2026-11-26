import { createClient } from '@supabase/supabase-js'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CashbookWorkspace } from './CashbookWorkspace'

const userId = '00000000-0000-4000-8000-000000000001'
const organizationId = '00000000-0000-4000-8000-000000000011'
const row = {
  id: '00000000-0000-4000-8000-000000000031', organization_id: organizationId,
  entry_on: '2026-11-24', description: 'Kasa girişi', entry_type: 'Yemek',
  incoming: '100.1', outgoing: '0', revision: 1,
  created_at: '2026-11-24T10:00:00+00:00', updated_at: '2026-11-24T10:00:00+00:00',
}

function setup(options: { accountant?: boolean; count?: number; write?: 'conflict' | 'forbidden'; invalid?: boolean; noMembership?: boolean; pending?: boolean } = {}) {
  const requests: { table: string; method: string; url: URL; body: unknown }[] = []
  let releaseLoad = () => {}
  const loadGate = options.pending ? new Promise<void>((resolve) => { releaseLoad = resolve }) : Promise.resolve()
  let rows = [options.invalid ? { ...row, incoming: '0.001' } : row]
  const fetcher: typeof fetch = async (input, init) => {
    await loadGate
    const url = new URL(input instanceof Request ? input.url : input)
    const method = init?.method ?? 'GET'
    const table = url.pathname.split('/').pop() ?? ''
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null
    requests.push({ table, method, url, body })
    const response = (data: unknown, status = 200, count?: number) => new Response(JSON.stringify(data), {
      status, headers: { 'content-type': 'application/json', ...(count !== undefined ? { 'content-range': `0-${Math.max(count - 1, 0)}/${count}` } : {}) },
    })
    if (table === 'organizations') return response([{ id: organizationId, name: 'Şirket' }])
    if (table === 'organization_memberships') return response(options.noMembership ? [] : [{
      organization_id: organizationId, cashbook_role: options.accountant ? 'accountant' : null,
    }])
    if (method === 'GET') return response(rows, 200, options.count ?? rows.length)
    if (options.write === 'forbidden') return response({ code: '42501', message: 'denied' }, 403)
    if (options.write === 'conflict') return response([])
    if (method === 'DELETE') {
      rows = []
      return response([{ id: row.id }])
    }
    // The form sends canonical decimal strings; the actual database sets metadata.
    if (typeof body !== 'object' || body === null) throw new Error('Missing mutation body')
    const saved = { ...row, ...body, revision: method === 'POST' ? 1 : 2 }
    rows = [saved]
    return response([saved])
  }
  const client = createClient('https://cashbook-test.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetcher },
  })
  vi.spyOn(client.auth, 'getSession').mockResolvedValue({ data: { session: {
    access_token: 'test-token', refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer',
    user: { id: userId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-11-24T00:00:00Z' },
  } }, error: null })
  render(<CashbookWorkspace client={client} />)
  return { requests, releaseLoad }
}

afterEach(() => vi.restoreAllMocks())

describe('Supabase kasa bağlantısı', () => {
  it('yükleme sürerken boş tablo yerine açık bir yükleniyor durumu gösterir', async () => {
    const { releaseLoad } = setup({ pending: true })

    expect(screen.getByRole('status')).toHaveTextContent('Kasa kayıtları yükleniyor')
    expect(screen.queryByRole('table', { name: 'Kasa hareketleri' })).not.toBeInTheDocument()

    releaseLoad()
    expect(await screen.findByText('Kasa girişi')).toBeVisible()
  })

  it('aktif üyeye tam ve kesin bakiye gösterir; rol atanmadan yazma açmaz', async () => {
    const { requests } = setup()
    expect(await screen.findByText('Kasa girişi')).toBeVisible()
    const summary = within(screen.getByRole('region', { name: 'Seçilen ayın kasa özeti' }))
    expect(summary.getAllByText('100,10 TL')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Kayıt ekle' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Kaydı düzenle:/ })).not.toBeInTheDocument()
    expect(requests.find(({ table }) => table === 'cashbook_entries')?.url.searchParams.get('select')).toContain('incoming::text')
  })

  it.each([{ count: 2 }, { invalid: true }])('eksik veya geçersiz yanıtta yanlış bakiye göstermez: %j', async (options) => {
    setup(options)
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(screen.getByRole('region', { name: 'Seçilen ayın kasa özeti' })).not.toHaveTextContent('100,10 TL')
    expect(screen.queryByText('Kasa girişi')).not.toBeInTheDocument()
  })

  it('şirket üyeliği olmayan kullanıcıya sıfır bakiye veya kayıt göstermez', async () => {
    setup({ noMembership: true })
    expect(await screen.findByRole('alert')).toHaveTextContent('Aktif şirket üyeliğiniz yok')
    const summary = within(screen.getByRole('region', { name: 'Seçilen ayın kasa özeti' }))
    expect(summary.getAllByText('—')).toHaveLength(3)
    expect(screen.queryByText('Kasa girişi')).not.toBeInTheDocument()
  })

  it('muhasebecinin yeni kaydını metin tutarlarıyla ve şirket kapsamıyla kaydeder', async () => {
    const user = userEvent.setup()
    const { requests } = setup({ accountant: true })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Kayıt ekle' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Kayıt ekle' }))
    expect(screen.getByRole('dialog')).toHaveClass('editor-dialog')
    const form = within(screen.getByRole('form'))
    await user.type(form.getByLabelText('Açıklama'), 'Yeni giriş')
    await user.selectOptions(form.getByLabelText('İşlem Türü'), 'Yemek')
    await user.clear(form.getByLabelText('Borç (Giren)'))
    await user.type(form.getByLabelText('Borç (Giren)'), '12,5')
    await user.click(form.getByRole('button', { name: 'Kaydet' }))
    expect(await screen.findByText('Kasa kaydı kaydedildi.')).toBeVisible()
    expect(requests.find(({ method }) => method === 'POST')?.body).toEqual({
      organization_id: organizationId, entry_on: '2026-11-01',
      description: 'Yeni giriş', entry_type: 'Yemek', incoming: '12.50', outgoing: '0.00',
    })
  })

  it('çakışmada revizyon filtresi gönderir, form girdisini korur ve sahte başarı göstermez', async () => {
    const user = userEvent.setup()
    const { requests } = setup({ accountant: true, write: 'conflict' })
    await user.click(await screen.findByRole('button', { name: 'Kaydı düzenle: Kasa girişi' }))
    await user.type(screen.getByLabelText('Açıklama'), ' düzeltme')
    await user.click(screen.getByRole('button', { name: 'Kaydet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Kayıt değişmiş')
    expect(screen.getByLabelText('Açıklama')).toHaveValue('Kasa girişi düzeltme')
    expect(screen.queryByText('Kasa kaydı kaydedildi.')).not.toBeInTheDocument()
    const update = requests.find(({ method }) => method === 'PATCH')
    expect(update?.url.searchParams.get('revision')).toBe('eq.1')
    expect(update?.url.searchParams.get('id')).toBe(`eq.${row.id}`)
  })

  it('formda iki pozitif yönü ve açık ay dışındaki tarihi kaydetmez', async () => {
    const user = userEvent.setup()
    const { requests } = setup({ accountant: true })
    await user.click(await screen.findByRole('button', { name: 'Kaydı düzenle: Kasa girişi' }))
    const form = within(screen.getByRole('form'))
    await user.clear(form.getByLabelText('Alacak (Çıkan)'))
    await user.type(form.getByLabelText('Alacak (Çıkan)'), '1')
    await user.click(form.getByRole('button', { name: 'Kaydet' }))
    expect(await screen.findByText(/Yalnızca giren veya çıkan tutarı pozitif/)).toBeVisible()
    await user.clear(form.getByLabelText('Alacak (Çıkan)'))
    await user.type(form.getByLabelText('Alacak (Çıkan)'), '0')
    await user.clear(form.getByLabelText('Tarih', { exact: true }))
    await user.type(form.getByLabelText('Tarih', { exact: true }), '01.12.2026')
    await user.click(form.getByRole('button', { name: 'Kaydet' }))
    expect(await screen.findByText('Seçilen ay içinde bir tarih girin.')).toBeVisible()
    expect(requests.some(({ method }) => method === 'POST' || method === 'PATCH')).toBe(false)
  })

  it('kaldırılmış yetkiyle silmede açık hata verir ve kaydı silinmiş göstermez', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { requests } = setup({ accountant: true, write: 'forbidden' })
    await user.click(await screen.findByRole('button', { name: 'Kaydı sil: Kasa girişi' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('kasa yetkiniz yok')
    expect(await screen.findByText('Kasa girişi')).toBeVisible()
    expect(requests.find(({ method }) => method === 'DELETE')?.url.searchParams.get('revision')).toBe('eq.1')
    expect(screen.queryByText(/Kasa kaydı silindi/)).not.toBeInTheDocument()
  })
})
