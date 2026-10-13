import { describe, expect, it, vi } from "vitest";
import { invalidContactEnv, readArcjetEnv, readSmtpEnv, reportContactEnv } from "./contact-env";

const SECRET = "s3cr3t-value-never-logged";

function completeEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    ARCJET_KEY: SECRET,
    CONTACT_SMTP_HOST: "smtp.example.org",
    CONTACT_SMTP_PORT: "587",
    CONTACT_SMTP_USER: "contact@example.org",
    CONTACT_SMTP_PASSWORD: SECRET,
    CONTACT_SMTP_FROM: "contact@example.org",
    ...overrides,
  };
}

describe("readSmtpEnv", () => {
  it("coerces the port to an integer", () => {
    const check = readSmtpEnv(completeEnv());
    expect(check).toMatchObject({ ok: true, value: { CONTACT_SMTP_PORT: 587 } });
  });

  it.each(["", "abc", "0", "65536", "25.5"])("rejects the port %j by name", (port) => {
    expect(readSmtpEnv(completeEnv({ CONTACT_SMTP_PORT: port }))).toEqual({
      ok: false,
      invalid: ["CONTACT_SMTP_PORT"],
    });
  });

  it("names every missing or blank variable once", () => {
    const check = readSmtpEnv(
      completeEnv({ CONTACT_SMTP_HOST: "  ", CONTACT_SMTP_FROM: undefined }),
    );
    expect(check).toEqual({ ok: false, invalid: ["CONTACT_SMTP_HOST", "CONTACT_SMTP_FROM"] });
  });
});

describe("readArcjetEnv", () => {
  it("accepts a key", () => {
    expect(readArcjetEnv(completeEnv())).toEqual({ ok: true, value: { ARCJET_KEY: SECRET } });
  });

  it("rejects an empty key by name", () => {
    expect(readArcjetEnv(completeEnv({ ARCJET_KEY: "" }))).toEqual({
      ok: false,
      invalid: ["ARCJET_KEY"],
    });
  });
});

describe("invalidContactEnv", () => {
  it("is empty for a complete configuration", () => {
    expect(invalidContactEnv(completeEnv())).toEqual([]);
  });

  it("lists every contact variable when nothing is set", () => {
    expect(invalidContactEnv({})).toEqual([
      "ARCJET_KEY",
      "CONTACT_SMTP_HOST",
      "CONTACT_SMTP_PORT",
      "CONTACT_SMTP_USER",
      "CONTACT_SMTP_PASSWORD",
      "CONTACT_SMTP_FROM",
    ]);
  });
});

describe("reportContactEnv", () => {
  it("logs nothing when the configuration is complete", () => {
    const log = vi.fn();
    expect(reportContactEnv(completeEnv(), log)).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  it("logs one line naming the variables and never a value", () => {
    const log = vi.fn();
    const env = completeEnv({ CONTACT_SMTP_HOST: "", CONTACT_SMTP_PORT: "not-a-port" });
    reportContactEnv(env, log);
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0]?.[0]);
    expect(line).toContain("CONTACT_SMTP_HOST, CONTACT_SMTP_PORT");
    for (const value of Object.values(env)) {
      if (value) expect(line).not.toContain(value);
    }
  });

  it("logs to console.error by default and reads process.env", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("ARCJET_KEY", "");
    reportContactEnv();
    vi.unstubAllEnvs();
    expect(String(errorLog.mock.calls[0]?.[0])).toContain("ARCJET_KEY");
    errorLog.mockRestore();
  });
});
