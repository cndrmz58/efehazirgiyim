import { describe, expect, it } from 'vitest'
import { readEnvironment } from './environment'

const valid = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-placeholder',
  VITE_APP_URL: 'https://app.efehazirgiyim.com',
}

describe('ortam yapılandırması', () => {
  it('henüz yapılandırılmamış kurulumu bağlantı varmış gibi göstermez', () => {
    expect(readEnvironment({ VITE_APP_URL: 'http://localhost:5173' })).toEqual({ status: 'unconfigured' })
  })

  it('kısmi yapılandırmayı ve tarayıcıya uygun olmayan anahtarı açıkça reddeder', () => {
    expect(readEnvironment({ VITE_SUPABASE_URL: valid.VITE_SUPABASE_URL })).toEqual({
      status: 'invalid',
      fields: ['VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_APP_URL'],
    })
    expect(readEnvironment({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_do-not-expose' })).toEqual({
      status: 'invalid',
      fields: ['VITE_SUPABASE_PUBLISHABLE_KEY'],
    })
  })

  it('çalıştırılabilir URL şemalarını reddeder ve ham girdiyi hata çıktısına eklemez', () => {
    expect(readEnvironment({ ...valid, VITE_SUPABASE_URL: 'javascript:alert(1)' })).toEqual({
      status: 'invalid',
      fields: ['VITE_SUPABASE_URL'],
    })
  })

  it('geçerli yapılandırmayı doğrular; ağ bağlantısı kurulduğunu iddia etmez', () => {
    expect(readEnvironment(valid)).toEqual({ status: 'configured', config: valid })
  })
})
