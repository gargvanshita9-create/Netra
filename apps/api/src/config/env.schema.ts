import { z } from 'zod';

/**
 * A key present but blank in .env arrives as "" — treat it as absent.
 *
 * Without this, copying .env.example verbatim either fails a `min(1)` on a var
 * that has a perfectly good default, or (worse) coerces "" to 0 and silently
 * prices every synthesis at nothing.
 */
function blankAsUnset<T extends z.ZodTypeAny>(schema: T): z.ZodEffects<T, T['_output'], unknown> {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema,
  );
}

const optionalNonEmpty = blankAsUnset(z.string().optional());

export const envSchema = z
  .object({
    PORT: blankAsUnset(z.coerce.number().int().positive().default(3000)),
    DATABASE_URL: z
      .string()
      .min(1, 'DATABASE_URL is required — the Postgres connection string for the netra_ro role.'),
    MONGODB_URL: z
      .string()
      .min(1, 'MONGODB_URL is required — the MongoDB connection string for app data.'),
    NETRA_TTS_MODE: blankAsUnset(z.enum(['fixture', 'live']).default('fixture')),
    AZURE_SPEECH_KEY: optionalNonEmpty,
    AZURE_SPEECH_REGION: optionalNonEmpty,
    /** Where synthesised speech is cached, relative to the repo root. */
    NETRA_TTS_CACHE_DIR: blankAsUnset(z.string().min(1).default('.cache/tts')),
    /**
     * Azure neural TTS list price per million characters. Configurable because
     * it is a price, and prices change — verify against current Azure pricing
     * rather than trusting this default.
     */
    NETRA_TTS_USD_PER_MILLION_CHARS: blankAsUnset(z.coerce.number().nonnegative().default(16)),
    /** Browser origin allowed to call this API. */
    NETRA_WEB_ORIGIN: blankAsUnset(z.string().min(1).default('http://localhost:5173')),
  })
  // Fail loudly at startup on missing config (CLAUDE.md §Errors). Discovering
  // the key is absent on the first synthesis, mid-demo, is the bad version.
  .superRefine((env, ctx) => {
    if (env.NETRA_TTS_MODE !== 'live') return;
    for (const key of ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION'] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when NETRA_TTS_MODE=live. Set it, or use NETRA_TTS_MODE=fixture to run without Azure.`,
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid or missing environment configuration:\n${issues}\n\nCheck the repo-root .env against .env.example.`,
    );
  }
  return result.data;
}
