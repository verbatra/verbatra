import { z } from "zod";

const requiredText = z.string().trim().min(1);

export const arcjetEnvSchema = z.object({
  ARCJET_KEY: requiredText,
});

export const smtpEnvSchema = z.object({
  CONTACT_SMTP_HOST: requiredText,
  CONTACT_SMTP_PORT: z.coerce.number().int().min(1).max(65_535),
  CONTACT_SMTP_USER: requiredText,
  CONTACT_SMTP_PASSWORD: z.string().min(1),
  CONTACT_SMTP_FROM: requiredText,
});

export type ArcjetEnv = z.infer<typeof arcjetEnvSchema>;

export type SmtpEnv = z.infer<typeof smtpEnvSchema>;

export type EnvCheck<T> = { ok: true; value: T } | { ok: false; invalid: string[] };

type Env = Readonly<Record<string, string | undefined>>;

function checkEnv<T>(schema: z.ZodType<T>, env: Env): EnvCheck<T> {
  const result = schema.safeParse(env);
  if (result.success) return { ok: true, value: result.data };
  const invalid = new Set(result.error.issues.map((issue) => String(issue.path[0])));
  return { ok: false, invalid: [...invalid] };
}

export function readArcjetEnv(env: Env = process.env): EnvCheck<ArcjetEnv> {
  return checkEnv(arcjetEnvSchema, env);
}

export function readSmtpEnv(env: Env = process.env): EnvCheck<SmtpEnv> {
  return checkEnv(smtpEnvSchema, env);
}

export function invalidContactEnv(env: Env = process.env): string[] {
  return [readArcjetEnv(env), readSmtpEnv(env)].flatMap((check) => (check.ok ? [] : check.invalid));
}

export function reportContactEnv(
  env: Env = process.env,
  log: (message: string) => void = console.error,
): string[] {
  const invalid = invalidContactEnv(env);
  if (invalid.length > 0) {
    log(
      `contact form: missing or invalid environment variables: ${invalid.join(", ")}. The contact form answers 500 until they are set; the rest of the site keeps serving.`,
    );
  }
  return invalid;
}
