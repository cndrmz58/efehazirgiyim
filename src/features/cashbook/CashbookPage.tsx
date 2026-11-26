import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { EditorDialog } from '../../components/EditorDialog'
import { tr } from '../../locales/tr'
import { formatMoney, toMinorUnits } from '../payments/payment-model'
import { summarizeCashbookMonth, type CashbookEntry } from './cashbook-model'

const initialPeriod = { id: '2026-11', label: `${tr.cashbook.months[10]} 2026` }
const periods = [
  initialPeriod,
  { id: '2026-12', label: `${tr.cashbook.months[11]} 2026` },
  ...tr.cashbook.months.map((month, index) => ({
    id: `2027-${String(index + 1).padStart(2, '0')}`,
    label: `${month} 2027`,
  })),
]

export function CashbookPage({ entries = null, canEdit = false, busy = false, editing = false, editor, notice, headerAction, onEditorCancel, onAdd, onEdit, onDelete }: {
  entries?: readonly CashbookEntry[] | null
  canEdit?: boolean
  busy?: boolean
  editing?: boolean
  editor?: ReactNode
  notice?: ReactNode
  headerAction?: ReactNode
  onEditorCancel?: () => void
  onAdd?: (period: string) => void
  onEdit?: (id: string, period: string) => void
  onDelete?: (id: string) => void
}) {
  const text = tr.cashbook
  const [selectedPeriod, setSelectedPeriod] = useState(initialPeriod)
  const summary = entries === null ? null : summarizeCashbookMonth(entries, selectedPeriod.id)

  return (
    <div className="cashbook-page">
      <header className="page-heading">
        <h1>{tr.navigation.cashbook}</h1>
        <div className="cashbook-header-actions">
          {headerAction}
          <button type="button" className="button-primary cashbook-add-button" disabled={!canEdit || busy || editing} aria-describedby="cashbook-backend-note" onClick={() => onAdd?.(selectedPeriod.id)}>
            <Plus size={17} aria-hidden="true" />
            {text.add}
          </button>
        </div>
      </header>
      {notice}
      {editor && <EditorDialog busy={busy} labelledBy="cashbook-form-heading" onDismiss={() => onEditorCancel?.()}>{editor}</EditorDialog>}
      <section className="settings-card cashbook-balance" aria-label={text.balanceSummary} aria-live="polite">
        <div>
          <h2>{selectedPeriod.label} — {text.balance}</h2>
          <p className="field-help">{text.balanceRule}</p>
        </div>
        <dl>
          <div><dt>{text.incoming}</dt><dd className="cashbook-incoming-amount">{summary ? formatMoney(summary.incoming, 'TRY') : '—'}</dd></div>
          <div><dt>{text.outgoing}</dt><dd>{summary ? formatMoney(summary.outgoing, 'TRY') : '—'}</dd></div>
          <div className="cashbook-current-balance">
            <dt>{text.balance}</dt>
            <dd className={summary && summary.balance > 0n ? 'cashbook-balance-positive' : summary && summary.balance < 0n ? 'cashbook-balance-negative' : undefined}>
              {summary ? formatMoney(summary.balance, 'TRY') : '—'}
            </dd>
          </div>
        </dl>
        {!summary && <p className="field-help">{text.balanceUnavailable}</p>}
      </section>
      <section className="table-card cashbook" aria-labelledby="cashbook-list-heading">
        <header className="table-card-heading">
          <h2 id="cashbook-list-heading" aria-live="polite">{selectedPeriod.label} — {text.list}</h2>
          <span className="record-count">{summary?.records.length ?? 0} {text.records}</span>
        </header>
        <div className="table-scroll" role="region" aria-label={text.tableRegion} tabIndex={0}>
          <table aria-label={text.list}>
            <thead>
              <tr>
                <th scope="col">{text.date}</th>
                <th scope="col">{text.descriptionColumn}</th>
                <th scope="col">{text.type}</th>
                <th scope="col" className="amount-heading">{text.incoming}</th>
                <th scope="col" className="amount-heading">{text.outgoing}</th>
                {canEdit && <th scope="col">{text.actions}</th>}
              </tr>
            </thead>
            <tbody>
              {summary?.records.length ? summary.records.map((entry) => (
                <tr className="payment-row" key={entry.id}>
                  <td><time dateTime={entry.date}>{entry.date.split('-').reverse().join('.')}</time></td>
                  <td>{entry.description}</td>
                  <td>{entry.type}</td>
                  <td className="amount-cell cashbook-incoming-amount">{formatMoney(toMinorUnits(entry.incoming), 'TRY')}</td>
                  <td className="amount-cell">{formatMoney(toMinorUnits(entry.outgoing), 'TRY')}</td>
                  {canEdit && <td><div className="cashbook-row-actions">
                    <button className="cashbook-row-action" type="button" disabled={busy || editing} aria-label={`${text.edit}: ${entry.description}`} title={text.edit} onClick={() => onEdit?.(entry.id, selectedPeriod.id)}><Pencil size={16} aria-hidden="true" /></button>
                    <button className="cashbook-row-action cashbook-row-delete" type="button" disabled={busy || editing} aria-label={`${text.remove}: ${entry.description}`} title={text.remove} onClick={() => onDelete?.(entry.id)}><Trash2 size={16} aria-hidden="true" /></button>
                  </div></td>}
                </tr>
              )) : <tr>
                <td colSpan={canEdit ? 6 : 5}>
                  <div className="empty-state">
                    <span className="empty-icon"><BookOpen size={24} aria-hidden="true" /></span>
                    <h3>{summary ? text.emptyTitle : text.unavailableTitle}</h3>
                    <p>{summary ? text.emptyDescription : text.balanceUnavailable}</p>
                  </div>
                </td>
              </tr>}
            </tbody>
          </table>
        </div>
      </section>
      <p className="field-help cashbook-backend-note" id="cashbook-backend-note">{text.backendNote}</p>
      <nav className="cashbook-month-bar" aria-label={text.monthNavigation}>
        {periods.map((period) => (
          <button
            key={period.id}
            type="button"
            className="cashbook-month"
            aria-pressed={selectedPeriod.id === period.id}
            disabled={busy || editing}
            onClick={() => setSelectedPeriod(period)}
          >
            {period.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
