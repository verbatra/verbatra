import { z } from "zod";
import { HONEYPOT_FIELD } from "./honeypot-field";

export const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email(),
  message: z.string().trim().min(10).max(5000),
  [HONEYPOT_FIELD]: z.string().optional().default(""),
});

export type ContactPayload = z.infer<typeof contactSchema>;

const CONTACT_FIELDS = ["name", "email", "message"] as const;

type ContactField = (typeof CONTACT_FIELDS)[number];

export type ContactFieldErrorCode = "required" | "invalid_email" | "too_short" | "too_long";

export type ContactFieldErrors = Partial<Record<ContactField, ContactFieldErrorCode>>;

export type ParsedContactPayload =
  | { success: true; data: ContactPayload }
  | { success: false; errors: ContactFieldErrors };

function isContactField(value: PropertyKey): value is ContactField {
  return typeof value === "string" && (CONTACT_FIELDS as readonly string[]).includes(value);
}

function errorCodeFor(field: ContactField, issueCode: string): ContactFieldErrorCode {
  if (field === "email") return "invalid_email";
  if (issueCode === "too_big") return "too_long";
  if (field === "name") return "required";
  return "too_short";
}

function collectFieldErrors(issues: ReadonlyArray<{ path: PropertyKey[]; code: string }>) {
  const errors: ContactFieldErrors = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (field === undefined || !isContactField(field)) continue;
    errors[field] ??= errorCodeFor(field, issue.code);
  }
  return errors;
}

export function parseContactPayload(body: unknown): ParsedContactPayload {
  const result = contactSchema.safeParse(body);
  if (result.success) return { success: true, data: result.data };
  return { success: false, errors: collectFieldErrors(result.error.issues) };
}

export function parseContactBody(text: string): ParsedContactPayload {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { success: false, errors: {} };
  }
  return parseContactPayload(body);
}
