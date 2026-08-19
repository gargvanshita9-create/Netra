import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required — the Postgres connection string for the netra_ro role.'),
  MONGODB_URL: z
    .string()
    .min(1, 'MONGODB_URL is required — the MongoDB connection string for app data.'),
  NETRA_TTS_MODE: z.enum(['fixture', 'live']).default('fixture'),
  AZURE_SPEECH_KEY: z.string().optional(),
  AZURE_SPEECH_REGION: z.string().optional(),
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
