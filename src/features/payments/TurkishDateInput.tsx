import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const monthFormatter = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const weekdayFormatter = new Intl.DateTimeFormat('tr-TR', { weekday: 'short', timeZone: 'UTC' })
const weekdays = Array.from({ length: 7 }, (_, index) =>
  weekdayFormatter.format(new Date(Date.UTC(2024, 0, index + 1))),
)

function isValidDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function toIsoDate(value: string) {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value)
  if (!match) return null

  const [, dayText, monthText, yearText] = match
  const day = Number(dayText)
  const month = Number(monthText)
  const year = Number(yearText)
  if (!isValidDate(year, month, day)) return null

  return `${yearText}-${monthText!.padStart(2, '0')}-${dayText!.padStart(2, '0')}`
}

function fromIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  return isValidDate(year, month, day) ? `${dayText}.${monthText}.${yearText}` : null
}

function localDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day!))
}

function isoDate(date: Date) {
  return `${date.getUTCFullYear().toString().padStart(4, '0')}-${(date.getUTCMonth() + 1).toString().padStart(2, '0')}-${date.getUTCDate().toString().padStart(2, '0')}`
}

function currentIsoDate() {
  const today = new Date()
  return isoDate(new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())))
}

export function TurkishDateInput({
  id,
  name,
  label,
  value,
  disabled = false,
  required = false,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  onChange,
}: {
  id: string
  name: string
  label: string
  value: string
  disabled?: boolean
  required?: boolean
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  onChange: (value: string) => void
}) {
  const initialDate = fromIsoDate(value) ? localDate(value) : localDate(currentIsoDate())
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(Date.UTC(initialDate.getUTCFullYear(), initialDate.getUTCMonth(), 1)))
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  function showCalendar() {
    const selected = fromIsoDate(value) ? localDate(value) : localDate(currentIsoDate())
    setVisibleMonth(new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1)))
    setOpen((current) => !current)
  }

  function changeMonth(offset: number) {
    setVisibleMonth((month) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + offset, 1)))
  }

  const monthStart = new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth(), 1))
  const leadingDays = (monthStart.getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() + 1, 0)).getUTCDate()
  const cellCount = Math.ceil((leadingDays + daysInMonth) / 7) * 7
  const calendarDates = Array.from({ length: cellCount }, (_, index) =>
    new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth(), index - leadingDays + 1)),
  )
  const selectedDate = fromIsoDate(value) ? value : ''
  const today = currentIsoDate()

  return (
    <div className="date-control" ref={root}>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="gg.aa.yyyy"
        value={fromIsoDate(value) ?? value}
        disabled={disabled}
        required={required}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        onChange={(event) => {
          const entered = event.currentTarget.value
          onChange(toIsoDate(entered) ?? entered)
        }}
      />
      <button
        ref={trigger}
        className="date-control-trigger"
        type="button"
        aria-label={`Takvimi ${open ? 'kapat' : 'aç'}: ${label}`}
        aria-expanded={open}
        aria-controls={`${id}-calendar`}
        disabled={disabled}
        onClick={showCalendar}
      >
        <CalendarDays size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="date-picker" id={`${id}-calendar`} role="dialog" aria-label={`${label} tarih seçici`}>
          <div className="date-picker-heading">
            <button type="button" className="date-picker-nav" aria-label="Önceki ay" onClick={() => changeMonth(-1)}>
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
            <strong>{monthFormatter.format(visibleMonth)}</strong>
            <button type="button" className="date-picker-nav" aria-label="Sonraki ay" onClick={() => changeMonth(1)}>
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </div>
          <div className="date-picker-grid" role="grid" aria-label={monthFormatter.format(visibleMonth)}>
            <div className="date-picker-weekdays" role="row">
              {weekdays.map((weekday, index) => (
                <span className="date-picker-weekday" role="columnheader" key={`${weekday}-${index}`}>{weekday}</span>
              ))}
            </div>
            {Array.from({ length: cellCount / 7 }, (_, week) => (
              <div className="date-picker-week" role="row" key={week}>
                {calendarDates.slice(week * 7, week * 7 + 7).map((date) => {
                  const dateValue = isoDate(date)
                  const inMonth = date.getUTCMonth() === visibleMonth.getUTCMonth()
                  return (
                    <div role="gridcell" aria-selected={dateValue === selectedDate} key={dateValue}>
                      <button
                        type="button"
                        className={`date-picker-day${inMonth ? '' : ' date-picker-day-outside'}`}
                        aria-label={dateFormatter.format(date)}
                        aria-pressed={dateValue === selectedDate}
                        aria-current={dateValue === today ? 'date' : undefined}
                        onClick={() => {
                          onChange(dateValue)
                          setOpen(false)
                          trigger.current?.focus()
                        }}
                      >
                        {date.getUTCDate()}
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
