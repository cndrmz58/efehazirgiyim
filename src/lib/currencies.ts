export const currencies = [
  { code: 'TRY', label: 'TL — Türk Lirası' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'USD', label: 'USD — ABD Doları' },
] as const

export type CurrencyCode = (typeof currencies)[number]['code']

export const defaultCurrency: CurrencyCode = 'TRY'
