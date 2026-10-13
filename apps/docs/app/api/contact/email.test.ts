import { afterEach, describe, expect, it, vi } from "vitest";
import { type EmailClient, resolveMailer, sendContactEmail } from "./email";
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

  it("logs only the error code and message of a failed send, not the full error object", async () => {
    setSmtpEnv();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = Object.assign(new Error("mailbox unavailable"), {
      code: "EENVELOPE",
      response: "550 rejected ada@example.com",
      envelope: { from: "contact@kreitz-webdev.de", to: ["info@kreitz-webdev.de"] },
    });
    const client = stubClient(vi.fn().mockRejectedValue(failure));

    await sendContactEmail(payload(), { client });

    expect(errorLog).toHaveBeenCalledWith("sendContactEmail: sendMail failed.", {
      code: "EENVELOPE",
      message: "mailbox unavailable",
    });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("ada@example.com");
    errorLog.mockRestore();
  });

  it("logs a failed send without a code when the error carries none", async () => {
    setSmtpEnv();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = stubClient(vi.fn().mockRejectedValue(new Error("network down")));

    await sendContactEmail(payload(), { client });

    expect(errorLog).toHaveBeenCalledWith("sendContactEmail: sendMail failed.", {
      message: "network down",
    });
    errorLog.mockRestore();
  });

  it("logs a placeholder instead of the value when the client rejects with a non-Error", async () => {
    setSmtpEnv();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = stubClient(vi.fn().mockRejectedValue({ envelope: { to: ["ada@example.com"] } }));

    const result = await sendContactEmail(payload(), { client });

    expect(result).toEqual({ ok: false });
    expect(errorLog).toHaveBeenCalledWith("sendContactEmail: sendMail failed.", {
      message: "non-Error rejection",
    });
    errorLog.mockRestore();
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

  it("sends from the trimmed CONTACT_SMTP_FROM the environment check validated", async () => {
    setSmtpEnv();
    process.env.CONTACT_SMTP_FROM = "  sender@kreitz-webdev.de  ";
    const sendMail = vi.fn().mockResolvedValue({ messageId: "message_1" });

    await sendContactEmail(payload(), { client: stubClient(sendMail) });

    expect(sendMail.mock.calls[0]?.[0]).toMatchObject({
      from: "verbatra docs contact form <sender@kreitz-webdev.de>",
    });
  });

  it("returns ok: false and names the variable when CONTACT_SMTP_FROM is blank", async () => {
    setSmtpEnv();
    process.env.CONTACT_SMTP_FROM = "   ";
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sendMail = vi.fn().mockResolvedValue({ messageId: "message_1" });

    const result = await sendContactEmail(payload(), { client: stubClient(sendMail) });

    expect(result).toEqual({ ok: false });
    expect(sendMail).not.toHaveBeenCalled();
    expect(errorLog.mock.calls.flat().join(" ")).toContain("CONTACT_SMTP_FROM");
    errorLog.mockRestore();
  });

  it("returns ok: false when CONTACT_SMTP_FROM is unset even with an injected client", async () => {
    setSmtpEnv();
    delete process.env.CONTACT_SMTP_FROM;
    const client = stubClient(vi.fn().mockResolvedValue({ messageId: "message_1" }));
    const result = await sendContactEmail(payload(), { client });
    expect(result).toEqual({ ok: false });
  });
});

describe("resolveMailer", () => {
  it("builds a real SMTP transport when every CONTACT_SMTP_* var is set and no client is injected", () => {
    setSmtpEnv();
    const mailer = resolveMailer({});
    expect(mailer?.fromAddress).toBe("contact@kreitz-webdev.de");
    expect(typeof mailer?.client.sendMail).toBe("function");
  });

  it.each(SMTP_ENV_VARS)("returns undefined when %s is missing", (missing) => {
    setSmtpEnv();
    delete process.env[missing];
    expect(resolveMailer({})).toBeUndefined();
  });

  it.each([
    ["587", 587, false],
    ["465", 465, true],
  ])(
    "passes CONTACT_SMTP_PORT=%s to the transport as the number %d (secure: %s)",
    (raw, port, secure) => {
      setSmtpEnv();
      process.env.CONTACT_SMTP_PORT = raw;
      const client = resolveMailer({})?.client as unknown as {
        options: { port: unknown; secure: unknown };
      };
      expect(client.options.port).toBe(port);
      expect(client.options.secure).toBe(secure);
    },
  );

  it.each(["abc", "0", "70000", "587.5"])(
    "returns undefined and names only the variable when CONTACT_SMTP_PORT is %s",
    (port) => {
      setSmtpEnv();
      process.env.CONTACT_SMTP_PORT = port;
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
      expect(resolveMailer({})).toBeUndefined();
      const logged = errorLog.mock.calls.flat().join(" ");
      errorLog.mockRestore();
      expect(logged).toContain("CONTACT_SMTP_PORT");
      expect(logged).not.toContain(port);
      expect(logged).not.toContain("test-password");
    },
  );

  it("never prints a value when variables are missing", () => {
    setSmtpEnv();
    delete process.env.CONTACT_SMTP_HOST;
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    resolveMailer({});
    const logged = errorLog.mock.calls.flat().join(" ");
    errorLog.mockRestore();
    expect(logged).toContain("CONTACT_SMTP_HOST");
    expect(logged).not.toContain("test-password");
    expect(logged).not.toContain("contact@kreitz-webdev.de");
  });

  it("uses the injected client in place of a transport and still takes the sender from the environment", () => {
    setSmtpEnv();
    const client: EmailClient = { sendMail: vi.fn() };
    expect(resolveMailer({ client })).toEqual({ client, fromAddress: "contact@kreitz-webdev.de" });
  });
});

describe("the server-only guard", () => {
  it("imports server-only first, so a client component that reaches the SMTP settings fails the build", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./email.ts", import.meta.url), "utf8");
    expect(source.startsWith('import "server-only";\n')).toBe(true);
  });
});
