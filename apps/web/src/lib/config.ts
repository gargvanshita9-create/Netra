import { z } from 'zod';

const envSchema = z.object({
  VITE_API_BASE_URL: z.string().url(),
});

function loadConfig(): { apiBaseUrl: string } {
  const result = envSchema.safeParse(import.meta.env);
  if (!result.success) {
    throw new Error(
      `Invalid or missing environment configuration:\n${result.error.issues
        .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
        .join('\n')}\n\nCheck the repo-root .env against .env.example.`,
    );
  }
  return { apiBaseUrl: result.data.VITE_API_BASE_URL };
}

export const config = loadConfig();
