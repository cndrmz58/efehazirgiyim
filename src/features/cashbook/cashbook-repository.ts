import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Failure, Result } from '../payments/payment-repository'
import { cashbookEntryTypeSchema, cashbookRecordSchema, type CashbookInput, type CashbookRecord } from './cashbook-model'

const columns = 'id, organization_id, entry_on, description, entry_type, incoming::text, outgoing::text, revision, created_at, updated_at'
const rowSchema = z.object({
  id: z.uuid(), organization_id: z.uuid(), entry_on: z.string(),
  description: z.string(), entry_type: cashbookEntryTypeSchema, incoming: z.string(), outgoing: z.string(),
  revision: z.number(), created_at: z.string(), updated_at: z.string(),
}).transform((row) => ({
  id: row.id, organizationId: row.organization_id, date: row.entry_on,
  description: row.description, type: row.entry_type, incoming: row.incoming, outgoing: row.outgoing,
  revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at,
})).pipe(cashbookRecordSchema)

export type CashbookOrganization = { id: string; name: string; canEdit: boolean }
export type CashbookWorkspace = { userId: string; organizations: CashbookOrganization[]; entries: CashbookRecord[] }

const failure = (reason: Failure) => ({ ok: false, reason }) as const
function classify(error: { code?: string }): Failure {
  if (error.code === '42501') return 'forbidden'
  if (error.code && ['23502', '23503', '23514', '22P02', '22003', '22007', '22008'].includes(error.code)) return 'invalid'
  return 'unavailable'
}

export async function loadCashbook(client: SupabaseClient): Promise<Result<CashbookWorkspace>> {
  try {
    const { data: { session }, error } = await client.auth.getSession()
    if (error || !session) return failure('forbidden')
    const [organizations, memberships, entries] = await Promise.all([
      client.from('organizations').select('id, name').order('name'),
      client.from('organization_memberships').select('organization_id, cashbook_role')
        .eq('user_id', session.user.id).eq('active', true),
      client.from('cashbook_entries').select(columns, { count: 'exact' })
        .order('entry_on').order('id'),
    ])
    const queryError = organizations.error ?? memberships.error ?? entries.error
    if (queryError) return failure(classify(queryError))
    const parsedOrganizations = z.array(z.object({ id: z.uuid(), name: z.string() })).safeParse(organizations.data)
    const parsedMemberships = z.array(z.object({
      organization_id: z.uuid(), cashbook_role: z.literal('accountant').nullable(),
    })).safeParse(memberships.data)
    const parsedEntries = z.array(rowSchema).safeParse(entries.data)
    if (!parsedOrganizations.success || !parsedMemberships.success || !parsedEntries.success) return failure('unavailable')
    if (entries.count !== parsedEntries.data.length) return failure('incomplete')
    const roles = new Map(parsedMemberships.data.map((membership) => [membership.organization_id, membership.cashbook_role]))
    return { ok: true, value: {
      userId: session.user.id,
      organizations: parsedOrganizations.data.filter(({ id }) => roles.has(id))
        .map((organization) => ({ ...organization, canEdit: roles.get(organization.id) === 'accountant' })),
      entries: parsedEntries.data,
    } }
  } catch {
    return failure('unavailable')
  }
}

function fields(input: CashbookInput) {
  return { entry_on: input.date, description: input.description, entry_type: input.type, incoming: input.incoming, outgoing: input.outgoing }
}

export async function saveCashbookEntry(client: SupabaseClient, input: CashbookInput, original?: CashbookRecord): Promise<Result<CashbookRecord>> {
  try {
    const query = original
      ? client.from('cashbook_entries').update(fields(input)).eq('id', original.id).eq('revision', original.revision)
      : client.from('cashbook_entries').insert({ organization_id: input.organizationId, ...fields(input) })
    const { data, error } = await query.select(columns)
    if (error) return failure(classify(error))
    if (data?.length === 0 && original) return failure('conflict')
    const parsed = z.array(rowSchema).length(1).safeParse(data)
    const saved = parsed.success ? parsed.data[0] : undefined
    return saved ? { ok: true, value: saved } : failure('unavailable')
  } catch {
    return failure('unavailable')
  }
}

export async function deleteCashbookEntry(client: SupabaseClient, entry: CashbookRecord): Promise<Result<null>> {
  try {
    const { data, error } = await client.from('cashbook_entries').delete()
      .eq('id', entry.id).eq('revision', entry.revision).select('id')
    if (error) return failure(classify(error))
    return data?.length === 1 ? { ok: true, value: null } : failure('conflict')
  } catch {
    return failure('unavailable')
  }
}
