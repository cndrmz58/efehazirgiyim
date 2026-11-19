import type { BrowserContext, Page, Route } from '@playwright/test'
import { expect } from '@playwright/test'

// In-memory stand-in for Supabase Auth and PostgREST. No request leaves the browser.
const userId = '00000000-0000-4000-8000-000000000001'
const organizationId = '00000000-0000-4000-8000-000000000011'
const departmentId = '00000000-0000-4000-8000-000000000021'

type Row = Record<string, unknown> & { id: string; revision: number }

const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

function session() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'ekip@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-11-19T00:00:00Z' }
  return {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, role: 'authenticated', exp: expiresAt })}.signature`,
    token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, refresh_token: 'refresh-token', user,
  }
}

function filters(url: URL) {
  return [...url.searchParams].filter(([, value]) => value.startsWith('eq.')).map(([key, value]) => [key, value.slice(3)] as const)
}

const matches = (row: Row, conditions: readonly (readonly [string, string])[]) =>
  conditions.every(([key, value]) => String(row[key]) === value)

export async function mockSupabase(context: BrowserContext) {
  const rows: Row[] = []
  let sequence = 0

  await context.route('**/auth/v1/**', async (route: Route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/token')) return route.fulfill({ json: session() })
    if (url.pathname.endsWith('/user')) return route.fulfill({ json: session().user })
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 })
    return route.fulfill({ status: 404, json: {} })
  })

  await context.route('**/rest/v1/**', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const table = url.pathname.split('/').pop()
    const method = request.method()

    if (method === 'GET' && table === 'departments') {
      return route.fulfill({ json: [{ id: departmentId, organization_id: organizationId, name: 'Finans' }] })
    }
    if (method === 'GET' && table === 'organization_memberships') {
      return route.fulfill({ json: [{ organization_id: organizationId, role: 'admin' }] })
    }
    if (method === 'GET' && table === 'department_memberships') return route.fulfill({ json: [] })
    if (table !== 'payments') return route.fulfill({ status: 404, json: {} })

    const conditions = filters(url)
    if (method === 'GET') {
      return route.fulfill({ json: rows, headers: {
        'access-control-allow-origin': '*',
        'access-control-expose-headers': 'content-range',
        'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0',
      } })
    }
    if (method === 'POST') {
      const now = new Date(Date.now() + sequence).toISOString()
      sequence += 1
      const row: Row = {
        ...request.postDataJSON() as Record<string, unknown>,
        id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
        revision: 1, created_at: now, updated_at: now,
      }
      rows.unshift(row)
      return route.fulfill({ status: 201, json: row })
    }
    const index = rows.findIndex((row) => matches(row, conditions))
    const target = rows[index]
    if (!target) return route.fulfill({ json: [] })
    if (method === 'PATCH') {
      const updated: Row = { ...target, ...request.postDataJSON() as Record<string, unknown>, revision: target.revision + 1, updated_at: new Date().toISOString() }
      rows[index] = updated
      return route.fulfill({ json: [updated] })
    }
    if (method === 'DELETE') {
      rows.splice(index, 1)
      return route.fulfill({ json: [{ id: target.id }] })
    }
    return route.fulfill({ status: 405, json: {} })
  })
}

export async function signIn(page: Page) {
  await page.goto('/giris')
  await page.getByLabel('Kurumsal e-posta').fill('ekip@example.com')
  await page.getByLabel('Parola').fill('ornek-parola-123')
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page).toHaveURL('/payments')
  await expect(page.getByRole('button', { name: 'Ödeme Ekle' })).toBeEnabled()
}
