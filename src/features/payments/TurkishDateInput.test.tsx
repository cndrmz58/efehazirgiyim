import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TurkishDateInput } from './TurkishDateInput'

function StatefulDateInput({ initialValue = '', onChange }: { initialValue?: string; onChange: (value: string) => void }) {
  const [value, setValue] = useState(initialValue)
  return (
    <label>
      Vade Tarihi
      <TurkishDateInput
        id="dueOn"
        name="dueOn"
        label="Vade Tarihi"
        value={value}
        onChange={(nextValue) => {
          onChange(nextValue)
          setValue(nextValue)
        }}
      />
    </label>
  )
}

describe('Türkçe tarih alanı', () => {
  it('gün.ay.yıl girer ve takvimde Türkçe ay adları gösterir', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<StatefulDateInput initialValue="2026-11-19" onChange={onChange} />)

    const input = screen.getByRole('textbox', { name: 'Vade Tarihi' })
    expect(input).toHaveAttribute('placeholder', 'gg.aa.yyyy')
    await user.clear(input)
    await user.type(input, '19.11.2026')
    expect(onChange).toHaveBeenLastCalledWith('2026-11-19')

    await user.click(screen.getByRole('button', { name: 'Takvimi aç: Vade Tarihi' }))
    const calendar = screen.getByRole('dialog', { name: 'Vade Tarihi tarih seçici' })
    expect(within(calendar).getByText('Kasım 2026')).toBeVisible()
    expect(within(calendar).getByRole('button', { name: '20 Kasım 2026' })).toBeVisible()
    await user.click(within(calendar).getByRole('button', { name: '20 Kasım 2026' }))
    expect(onChange).toHaveBeenLastCalledWith('2026-11-20')
  })

  it('geçersiz gün.ay.yıl girdisini doğrulama için olduğu gibi tutar', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<StatefulDateInput onChange={onChange} />)

    await user.type(screen.getByRole('textbox', { name: 'Vade Tarihi' }), '31.02.2026')
    expect(onChange).toHaveBeenLastCalledWith('31.02.2026')
  })
})
