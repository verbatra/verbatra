import { afterEach, describe, expect, it, vi } from "vitest";
import { type EmailClient, resolveClient, sendContactEmail } from "./email";
import { HONEYPOT_FIELD } from "./honeypot-field";
import type { ContactPayload } from "./schema";

function payload(): ContactPayload {
  return {
    name: "Ada Lovelace",
    email: "ada@example.com",
    message: "Hello, I would like to know more about verbatra.",
    [HONEYPOT_FIELD]: "",
  };
}

function stubClient(sendMail: EmailClient["sendMail"]) {
  const client: EmailClient = { sendMail };
  return client;
}

const SMTP_ENV_VARS = [
  "CONTACT_SMTP_HOST",
  "CONTACT_SMTP_PORT",
  "CONTACT_SMTP_USER",
  "CONTACT_SMTP_PASSWORD",
  "CONTACT_SMTP_FROM",
] as const;

const originalEnv = Object.fromEntries(SMTP_ENV_VARS.map((name) => [name, process.env[name]]));

function setSmtpEnv() {
  process.env.CONTACT_SMTP_HOST = "smtp.kreitz-webdev.de";
  process.env.CONTACT_SMTP_PORT = "587";
  process.env.CONTACT_SMTP_USER = "contact@kreitz-webdev.de";
  process.env.CONTACT_SMTP_PASSWORD = "test-password";
  process.env.CONTACT_SMTP_FROM = "contact@kreitz-webdev.de";
}

afterEach(() => {
  for (const name of SMTP_ENV_VARS) {
    const original = originalEnv[name];
    if (original === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = original;
    }
  }
});

describe("sendContactEmail", () => {
  it("sends exactly one email with the expected to, from, and content", async () => {
    setSmtpEnv();
    const sendMail = vi.fn().mockResolvedValue({ messageId: "message_1" });
    const client = stubClient(sendMail);
    const result = await sendContactEmail(payload(), { client });

    expect(result).toEqual({ ok: true });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const call = sendMail.mock.calls[0]?.[0] as {
      from: string;
      to: string[];
      subject: string;
      text: string;
      replyTo: string;
    };
    expect(call.to).toEqual(["info@kreitz-webdev.de"]);
    expect(call.from).toBe("verbatra docs contact form <contact@kreitz-webdev.de>");
    expect(call.replyTo).toBe("ada@example.com");
    expect(call.text).toContain("Ada Lovelace");
    expect(call.text).toContain("Hello, I would like to know more about verbatra.");
  });

  it("returns ok: false and does not throw when the SMTP server rejects the message", async () => {
    setSmtpEnv();
    const client = stubClient(vi.fn().mockRejectedValue(new Error("mailbox unavailable")));
    const result = await sendContactEmail(payload(), { client });
    expect(result).toEqual({ ok: false });
  });

  it("returns ok: false when the client throws", async () => {
    setSmtpEnv();
    const client: EmailClient = {
      sendMail: vi.fn().mockRejectedValue(new Error("network down")),
    };
    const result = await sendContactEmail(payload(), { client });
    expect(result).toEqual({ ok: false });
  });

  it("fails closed with ok: false when SMTP env vars are unset and no client is injected", async () => {
    for (const name of SMTP_ENV_VARS) {
      delete process.env[name];
    }
    const result = await sendContactEmail(payload());
    expect(result).toEqual({ ok: false });
  });
});

describe("resolveClient", () => {
  it("builds a real SMTP transport when every CONTACT_SMTP_* var is set and no client is injected", () => {
    setSmtpEnv();
    const client = resolveClient({});
    expect(client).toBeDefined();
    expect(typeof client?.sendMail).toBe("function");
  });

  it.each(SMTP_ENV_VARS)("returns undefined when %s is missing", (missing) => {
    setSmtpEnv();
    delete process.env[missing];
    expect(resolveClient({})).toBeUndefined();
  });

  it("returns the injected client without touching CONTACT_SMTP_* vars", () => {
    for (const name of SMTP_ENV_VARS) {
      delete process.env[name];
    }
    const client: EmailClient = { sendMail: vi.fn() };
    expect(resolveClient({ client })).toBe(client);
  });
});
