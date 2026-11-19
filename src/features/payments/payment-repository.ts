import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { paymentSchema, type Payment, type PaymentInput } from './payment-model'

// Amounts are read as text so exact decimal values never pass through a JavaScript number.
const columns = 'id, organization_id, department_id, detail, payment_type, amount::text, currency, due_on, paid_on, notes, status, revision, created_at, updated_at'

const rowSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  department_id: z.string(),
  detail: z.string(),
  payment_type: z.string(),
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

const departmentRowSchema = z.object({ id: z.uuid(), organization_id: z.uuid(), name: z.string() })
const organizationRoleSchema = z.object({ organization_id: z.uuid(), role: z.enum(['admin', 'member']) })
const departmentRoleSchema = z.object({ department_id: z.uuid(), role: z.enum(['manager', 'editor', 'viewer']) })

export type Department = { id: string; organizationId: string; name: string; canEdit: boolean; canDelete: boolean }
export type PaymentWorkspace = { userId: string; departments: Department[]; payments: Payment[] }
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
    departmentId: value.department_id,
    detail: value.detail,
    type: value.payment_type,
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

    const [departments, organizationRoles, departmentRoles, payments] = await Promise.all([
      client.from('departments').select('id, organization_id, name').order('name'),
      client.from('organization_memberships').select('organization_id, role').eq('user_id', userId).eq('active', true),
      client.from('department_memberships').select('department_id, role').eq('user_id', userId),
      client.from('payments').select(columns, { count: 'exact' }).order('created_at', { ascending: false }),
    ])
    const error = departments.error ?? organizationRoles.error ?? departmentRoles.error ?? payments.error
    if (error) return failure(classify(error))

    const parsedDepartments = z.array(departmentRowSchema).safeParse(departments.data)
    const parsedOrganizationRoles = z.array(organizationRoleSchema).safeParse(organizationRoles.data)
    const parsedDepartmentRoles = z.array(departmentRoleSchema).safeParse(departmentRoles.data)
    const parsedPayments = toPayments(payments.data ?? [])
    if (!parsedDepartments.success || !parsedOrganizationRoles.success || !parsedDepartmentRoles.success || !parsedPayments) {
      return failure('unavailable')
    }
    // Never show partial totals if the API row limit truncated the result.
    if (payments.count !== parsedPayments.length) return failure('incomplete')

    const adminOrganizations = new Set(parsedOrganizationRoles.data.filter(({ role }) => role === 'admin').map(({ organization_id }) => organization_id))
    const roles = new Map(parsedDepartmentRoles.data.map(({ department_id, role }) => [department_id, role]))
    return {
      ok: true,
      value: {
        userId,
        payments: parsedPayments,
        departments: parsedDepartments.data.map(({ id, organization_id, name }) => {
          const admin = adminOrganizations.has(organization_id)
          const role = roles.get(id)
          return {
            id,
            organizationId: organization_id,
            name,
            canEdit: admin || role === 'manager' || role === 'editor',
            canDelete: admin || role === 'manager',
          }
        }),
      },
    }
  } catch {
    return failure('unavailable')
  }
}

export async function createPayment(client: SupabaseClient, input: PaymentInput, organizationId: string): Promise<Result<Payment>> {
  try {
    const { data, error } = await client.from('payments')
      .insert({ organization_id: organizationId, department_id: input.departmentId, ...editableFields(input) })
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
