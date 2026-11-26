import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { PaymentContext, type PaymentStore } from '../payments/payment-store'
import { paymentSchema } from '../payments/payment-model'
import { localIsoDate } from '../payments/payment-model'
import { OverviewPage } from './OverviewPage'

const organizationId = '00000000-0000-4000-8000-000000000011'

function payment(id: string, detail: string, dueOn: string) {
  return paymentSchema.parse({
    id,
    organizationId,
    detail,
    type: 'invoice',
    paymentMethod: 'bank',
    amount: '100.00',
    remainingAmount: '100.00',
    currency: 'TRY',
    dueOn,
    paidOn: '',
    notes: '',
    status: 'unpaid',
    createdAt: '2026-11-18T12:00:00Z',
    createdBy: null,
    updatedAt: '2026-11-18T12:00:00Z',
    revision: 1,
  })
}

describe('genel bakış vade listeleri', () => {
  it('gecikmiş ve yaklaşan kayıtları şirket, vade ve kalan tutarla özetin üstünde gösterir', () => {
    const store: PaymentStore = {
      status: 'ready',
      payments: [
        payment('00000000-0000-4000-8000-000000000031', 'Gecikmiş fatura', '2000-01-01'),
        payment('00000000-0000-4000-8000-000000000032', 'Bugünkü fatura', localIsoDate()),
      ],
      organizations: [{ id: organizationId, name: 'EFE Tekstil', canEdit: false }],
      creatorLabels: [],
      historicalCreatorLabels: [],
      canEdit: false,
      busy: false,
      error: null,
      feedback: '',
      reload: () => undefined,
      savePayment: async () => false,
      deletePayment: async () => false,
    }

    render(
      <MemoryRouter>
        <PaymentContext.Provider value={store}><OverviewPage /></PaymentContext.Provider>
      </MemoryRouter>,
    )

    const overdueList = screen.getByRole('list', { name: 'Gecikmiş ödemeler listesi' })
    const upcomingList = screen.getByRole('list', { name: 'Yaklaşan vadeler · 30 gün listesi' })
    expect(within(overdueList).getByText('Gecikmiş fatura')).toBeVisible()
    expect(within(upcomingList).getByText('Bugünkü fatura')).toBeVisible()
    expect(within(upcomingList).getByText('EFE Tekstil')).toBeVisible()
    expect(within(upcomingList).getByText('100,00 TL')).toBeVisible()

    const dueHeading = screen.getByRole('heading', { name: 'Gecikmiş ödemeler' })
    const trendHeading = screen.getByRole('heading', { name: 'Ödenen tutar eğilimi' })
    expect(dueHeading.compareDocumentPosition(trendHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
