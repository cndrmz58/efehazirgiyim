import { z } from 'zod'

const webUrl = z.url().refine(
  (value) => ['http:', 'https:'].includes(new URL(value).protocol),
  'HTTP veya HTTPS adresi gerekli.',
)

const environmentSchema = z.object({
  VITE_SUPABASE_URL: webUrl,
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().regex(/^sb_publishable_[A-Za-z0-9_-]+$/),
  VITE_APP_URL: webUrl,
})

type EnvironmentSource = {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
  VITE_APP_URL?: string
}

export type EnvironmentState =
  | { status: 'unconfigured' }
  | { status: 'invalid'; fields: string[] }
  | { status: 'configured'; config: z.infer<typeof environmentSchema> }

export function readEnvironment(source: EnvironmentSource): EnvironmentState {
  if (!source.VITE_SUPABASE_URL && !source.VITE_SUPABASE_PUBLISHABLE_KEY) {
    return { status: 'unconfigured' }
  }

  const result = environmentSchema.safeParse(source)

  if (!result.success) {
    return {
      status: 'invalid',
      fields: [...new Set(result.error.issues.map((issue) => issue.path.join('.')))],
    }
  }

  return { status: 'configured', config: result.data }
}
