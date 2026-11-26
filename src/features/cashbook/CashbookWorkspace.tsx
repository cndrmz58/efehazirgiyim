import type { SupabaseClient } from '@supabase/supabase-js'
import { RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { tr } from '../../locales/tr'
import type { Failure } from '../payments/payment-repository'
import { CashbookForm } from './CashbookForm'
import { CashbookPage } from './CashbookPage'
import { cashbookInputSchema, type CashbookInput, type CashbookRecord } from './cashbook-model'
import { deleteCashbookEntry, loadCashbook, saveCashbookEntry, type CashbookWorkspace as Workspace } from './cashbook-repository'

type State = { status: 'loading' | 'ready' | 'error'; workspace: Workspace | null; error: string | null }
type Editor = { original: CashbookRecord | null; period: string; organizationId: string }

export function CashbookWorkspace({ client }: { client: SupabaseClient | null }) {
  const text = tr.cashbook
  const [state, setState] = useState<State>({ status: 'loading', workspace: null, error: null })
  const [reloadKey, setReloadKey] = useState(0)
  const [organizationId, setOrganizationId] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const generation = useRef(0)
  const acting = useRef(false)
  const userId = useRef<string | null>(null)

  function reload() {
    generation.current += 1
    setState({ status: 'loading', workspace: null, error: null })
    setReloadKey((key) => key + 1)
  }

  useEffect(() => {
    if (!client) return
    const request = ++generation.current
    void loadCashbook(client).then((result) => {
      if (request !== generation.current) return
      if (result.ok) {
        userId.current = result.value.userId
        setState({ status: 'ready', workspace: result.value, error: null })
      } else {
        setState({ status: 'error', workspace: null, error: text.failures[result.reason] })
      }
    })
    return () => { generation.current += 1 }
  }, [client, reloadKey, text])

  useEffect(() => {
    if (!client) return
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (session && session.user.id !== userId.current)) {
        generation.current += 1
        userId.current = session?.user.id ?? null
        setState({ status: 'loading', workspace: null, error: null })
        setOrganizationId('')
        setEditor(null)
        setActionError(null)
        setFeedback('')
        setReloadKey((key) => key + 1)
      }
    })
    return () => subscription.unsubscribe()
  }, [client])

  const organizations = state.workspace?.organizations ?? []
  const organization = organizations.find(({ id }) => id === organizationId) ?? organizations[0]
  const entries = state.status === 'ready' && organization
    ? state.workspace?.entries.filter((entry) => entry.organizationId === organization.id) ?? null
    : null
  const locked = busy || state.status !== 'ready'

  function fail(reason: Failure) {
    setActionError(text.failures[reason])
    setFeedback('')
    if (reason === 'conflict' || reason === 'forbidden') reload()
  }

  async function save(input: CashbookInput) {
    if (acting.current) return
    if (!client || state.status !== 'ready' || !organization?.canEdit) return fail('forbidden')
    const parsed = cashbookInputSchema.safeParse(input)
    if (!parsed.success) return fail('invalid')
    if (parsed.data.organizationId !== organization.id || (editor?.original && editor.original.organizationId !== organization.id)) return fail('forbidden')
    acting.current = true
    setBusy(true)
    setFeedback('')
    const request = generation.current
    const result = await saveCashbookEntry(client, parsed.data, editor?.original ?? undefined)
    acting.current = false
    setBusy(false)
    if (request !== generation.current) return
    if (!result.ok) return fail(result.reason)
    setEditor(null)
    setActionError(null)
    setFeedback(text.saved)
    reload()
  }

  async function remove(id: string) {
    if (acting.current) return
    if (!client || !organization?.canEdit) return fail('forbidden')
    const entry = entries?.find((item) => item.id === id)
    if (!entry) return fail('conflict')
    if (!window.confirm(text.confirmDelete)) return
    acting.current = true
    setBusy(true)
    setFeedback('')
    const request = generation.current
    const result = await deleteCashbookEntry(client, entry)
    acting.current = false
    setBusy(false)
    if (request !== generation.current) return
    if (!result.ok) return fail(result.reason)
    setActionError(null)
    setFeedback(text.deleted)
    reload()
  }

  return <CashbookPage entries={entries} loading={Boolean(client) && state.status === 'loading'}
    canEdit={Boolean(organization?.canEdit)} busy={busy} editing={editor !== null}
    headerAction={<button className="button-secondary" type="button" disabled={!client || busy || state.status === 'loading'} onClick={reload}><RefreshCw size={16} aria-hidden="true" />{text.reload}</button>}
    onAdd={(period) => { if (organization?.canEdit) { setFeedback(''); setActionError(null); setEditor({ original: null, period, organizationId: organization.id }) } }}
    onEdit={(id, period) => {
      const original = entries?.find((entry) => entry.id === id)
      if (original && organization?.canEdit) { setFeedback(''); setActionError(null); setEditor({ original, period, organizationId: organization.id }) }
    }}
    onDelete={(id) => { void remove(id) }}
    onEditorCancel={() => { setEditor(null); setActionError(null) }}
    editor={editor && <CashbookForm key={`${editor.original?.id ?? 'new'}-${editor.organizationId}`}
      original={editor.original}
      organization={{ id: editor.organizationId, name: organizations.find(({ id }) => id === editor.organizationId)?.name ?? '', canEdit: true }}
      period={editor.period} busy={locked || !organization?.canEdit}
      onSave={(input) => { void save(input) }} onCancel={() => { setEditor(null); setActionError(null) }} />}
    notice={<>
      {organizations.length > 1 && <div className="form-actions"><label className="form-field">{text.organization}
          <select value={organization?.id ?? ''} disabled={busy || editor !== null} onChange={(event) => {
            setOrganizationId(event.target.value); setFeedback(''); setActionError(null)
          }}>{organizations.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}</select>
        </label></div>}
      {!client && <p role="status">{text.unconfigured}</p>}
      {state.status === 'ready' && !organization && <p role="alert">{text.noAccess}</p>}
      {(state.error || actionError) && <p className="form-error" role="alert">{state.error ?? actionError}</p>}
      {feedback && <p role="status">{feedback}</p>}
    </>}
  />
}
