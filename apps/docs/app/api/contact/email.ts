import "server-only";
import { createTransport, type Transporter } from "nodemailer";
import { readSmtpEnv } from "@/lib/contact-env";
import type { ContactPayload } from "./schema";

const CONTACT_RECIPIENT = "info@kreitz-webdev.de";

export type EmailClient = {
  sendMail: Transporter["sendMail"];
};

export type SendContactEmailDeps = {
  client?: EmailClient;
};

export type SendContactEmailResult = { ok: true } | { ok: false };

function buildNotificationEmail(payload: ContactPayload): { subject: string; text: string } {
  const subject = `New contact form message from ${payload.name}`;
  const text = [
    "You received a new message through the verbatra docs contact form.",
    "",
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    "",
    "Message:",
    payload.message,
  ].join("\n");
  return { subject, text };
}

function describeSendFailure(error: unknown): { code?: string; message: string } {
  if (!(error instanceof Error)) {
    return { message: "non-Error rejection" };
  }
  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  return code === undefined ? { message: error.message } : { code, message: error.message };
}

export type ContactMailer = {
  client: EmailClient;
  fromAddress: string;
};

export function resolveMailer(deps: SendContactEmailDeps): ContactMailer | undefined {
  const smtp = readSmtpEnv();
  if (!smtp.ok) {
    console.error(
      `sendContactEmail: missing or invalid environment variables: ${smtp.invalid.join(", ")}`,
    );
    return undefined;
  }

  const {
    CONTACT_SMTP_HOST,
    CONTACT_SMTP_PORT,
    CONTACT_SMTP_USER,
    CONTACT_SMTP_PASSWORD,
    CONTACT_SMTP_FROM,
  } = smtp.value;
  const client =
    deps.client ??
    createTransport({
      host: CONTACT_SMTP_HOST,
      port: CONTACT_SMTP_PORT,
      secure: CONTACT_SMTP_PORT === 465,
      auth: { user: CONTACT_SMTP_USER, pass: CONTACT_SMTP_PASSWORD },
    });
  return { client, fromAddress: CONTACT_SMTP_FROM };
}

export async function sendContactEmail(
  payload: ContactPayload,
  deps: SendContactEmailDeps = {},
): Promise<SendContactEmailResult> {
  const mailer = resolveMailer(deps);
  if (!mailer) return { ok: false };
  const { client, fromAddress } = mailer;
  const from = `verbatra docs contact form <${fromAddress}>`;

  const { subject, text } = buildNotificationEmail(payload);

  try {
    await client.sendMail({
      from,
      to: [CONTACT_RECIPIENT],
      subject,
      text,
      replyTo: payload.email,
    });
    return { ok: true };
  } catch (error) {
    console.error("sendContactEmail: sendMail failed.", describeSendFailure(error));
    return { ok: false };
  }
}
