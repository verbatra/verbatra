import { createTransport, type Transporter } from "nodemailer";
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

export function resolveClient(deps: SendContactEmailDeps): EmailClient | undefined {
  if (deps.client) return deps.client;

  const host = process.env.CONTACT_SMTP_HOST;
  const port = process.env.CONTACT_SMTP_PORT;
  const user = process.env.CONTACT_SMTP_USER;
  const password = process.env.CONTACT_SMTP_PASSWORD;
  const from = process.env.CONTACT_SMTP_FROM;

  if (
    host === undefined ||
    host.length === 0 ||
    port === undefined ||
    port.length === 0 ||
    user === undefined ||
    user.length === 0 ||
    password === undefined ||
    password.length === 0 ||
    from === undefined ||
    from.length === 0
  ) {
    return undefined;
  }

  return createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass: password },
  });
}

export async function sendContactEmail(
  payload: ContactPayload,
  deps: SendContactEmailDeps = {},
): Promise<SendContactEmailResult> {
  const client = resolveClient(deps);
  if (!client) return { ok: false };

  const fromAddress = process.env.CONTACT_SMTP_FROM;
  if (fromAddress === undefined || fromAddress.length === 0) return { ok: false };
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
  } catch {
    return { ok: false };
  }
}
