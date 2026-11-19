import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { paymentSchema, type Payment, type PaymentInput } from './payment-model'

// Amounts are read as text so exact decimal values never pass through a JavaScript number.
const columns = 'id, organization_id, detail, payment_type, payment_method, amount::text, currency, due_on, paid_on, notes, status, revision, created_at, updated_at'

const rowSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  detail: z.string(),
  payment_type: z.string(),
  payment_method: z.enum(['check', 'cash', 'bank']).nullable(),
  amount: z.string(),
  currency: z.string(),
  due_on: z.string().nullable(),
  paid_on: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.string(),
  revision: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
})

const organizationRowSchema = z.object({ id: z.uuid(), name: z.string() })
const organizationRoleSchema = z.object({
  organization_id: z.uuid(),
  role: z.enum(['admin', 'member']),
  payment_role: z.enum(['manager', 'viewer']).nullable(),
})

export type PaymentOrganization = { id: string; name: string; canEdit: boolean }
export type PaymentWorkspace = { userId: string; organizations: PaymentOrganization[]; payments: Payment[] }
export type Failure = 'conflict' | 'forbidden' | 'invalid' | 'incomplete' | 'unavailable'
export type Result<T> = { ok: true; value: T } | { ok: false; reason: Failure }

const failure = (reason: Failure) => ({ ok: false, reason }) as const

function classify(error: { code?: string } | null | undefined): Failure {
  if (error?.code === '42501') return 'forbidden'
  if (error?.code && ['23502', '23503', '23514', '22P02', '22003', '22007', '22008'].includes(error.code)) return 'invalid'
  return 'unavailable'
}

function toPayment(row: unknown): Payment | null {
  const parsed = rowSchema.safeParse(row)
  if (!parsed.success) return null
  const value = parsed.data
  const payment = paymentSchema.safeParse({
    id: value.id,
    organizationId: value.organization_id,
    detail: value.detail,
    type: value.payment_type,
    paymentMethod: value.payment_method,
    amount: value.amount,
    currency: value.currency,
    dueOn: value.due_on ?? '',
    paidOn: value.paid_on ?? '',
    notes: value.notes ?? '',
    status: value.status,
    revision: value.revision,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  })
  return payment.success ? payment.data : null
}

function toPayments(rows: readonly unknown[]): Payment[] | null {
  const payments = rows.map(toPayment)
  return payments.every((payment) => payment !== null) ? payments as Payment[] : null
}

function editableFields(input: PaymentInput) {
  return {
    detail: input.detail,
    payment_type: input.type,
    payment_method: input.paymentMethod,
    amount: input.amount,
    currency: input.currency,
    due_on: input.dueOn || null,
    paid_on: input.paidOn || null,
    notes: input.notes || null,
    status: input.status,
  }
}

export async function loadPaymentWorkspace(client: SupabaseClient): Promise<Result<PaymentWorkspace>> {
  try {
    const { data: { session }, error: sessionError } = await client.auth.getSession()
    if (sessionError || !session) return failure('forbidden')
    const userId = session.user.id

    const [organizations, organizationRoles, payments] = await Promise.all([
      client.from('organizations').select('id, name').order('name'),
      client.from('organization_memberships').select('organization_id, role, payment_role').eq('user_id', userId).eq('active', true),
      client.from('payments').select(columns, { count: 'exact' }).order('created_at', { ascending: false }),
    ])
    const error = organizations.error ?? organizationRoles.error ?? payments.error
    if (error) return failure(classify(error))

    const parsedOrganizations = z.array(organizationRowSchema).safeParse(organizations.data)
    const parsedOrganizationRoles = z.array(organizationRoleSchema).safeParse(organizationRoles.data)
    const parsedPayments = toPayments(payments.data ?? [])
    if (!parsedOrganizations.success || !parsedOrganizationRoles.success || !parsedPayments) {
      return failure('unavailable')
    }
    // Never show partial totals if the API row limit truncated the result.
    if (payments.count !== parsedPayments.length) return failure('incomplete')

    const roles = new Map(parsedOrganizationRoles.data.map((membership) => [membership.organization_id, membership]))
    return {
      ok: true,
      value: {
        userId,
        payments: parsedPayments,
        organizations: parsedOrganizations.data.flatMap(({ id, name }) => {
          const membership = roles.get(id)
          if (!membership || (membership.role !== 'admin' && !membership.payment_role)) return []
          return [{ id, name, canEdit: membership.role === 'admin' || membership.payment_role === 'manager' }]
        }),
      },
    }
  } catch {
    return failure('unavailable')
  }
}

export async function createPayment(client: SupabaseClient, input: PaymentInput): Promise<Result<Payment>> {
  try {
    const { data, error } = await client.from('payments')
      .insert({ organization_id: input.organizationId, ...editableFields(input) })
      .select(columns)
      .single()
    if (error) return failure(classify(error))
    const payment = toPayment(data)
    return payment ? { ok: true, value: payment } : failure('unavailable')
  } catch {
    return failure('unavailable')
  }
}

export async function updatePayment(client: SupabaseClient, original: Payment, input: PaymentInput): Promise<Result<Payment>> {
  try {
    const { data, error } = await client.from('payments')
      .update(editableFields(input))
      .eq('id', original.id)
      .eq('revision', original.revision)
      .select(columns)
    if (error) return failure(classify(error))
    if (!data || data.length === 0) return failure('conflict')
    const payment = toPayment(data[0])
    return payment ? { ok: true, value: payment } : failure('unavailable')
  } catch {
    return failure('unavailable')
  }
}

export async function deletePayment(client: SupabaseClient, target: Payment): Promise<Result<null>> {
  try {
    const { data, error } = await client.from('payments')
      .delete()
      .eq('id', target.id)
      .eq('revision', target.revision)
      .select('id')
    if (error) return failure(classify(error))
    return data && data.length === 1 ? { ok: true, value: null } : failure('conflict')
  } catch {
    return failure('unavailable')
  }
}
