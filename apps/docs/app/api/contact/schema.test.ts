import { describe, expect, it } from "vitest";
import { HONEYPOT_FIELD } from "./honeypot-field";
import { contactSchema, parseContactBody, parseContactPayload } from "./schema";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ada Lovelace",
    email: "ada@example.com",
    message: "Hello, I would like to know more about verbatra.",
    ...overrides,
  };
}

describe("contactSchema", () => {
  it("accepts a valid payload and defaults the honeypot field to an empty string", () => {
    const result = contactSchema.safeParse(validBody());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[HONEYPOT_FIELD]).toBe("");
    }
  });

  it("accepts a filled honeypot field", () => {
    const result = contactSchema.safeParse(validBody({ [HONEYPOT_FIELD]: "https://spam.example" }));
    expect(result.success).toBe(true);
  });
});

describe("parseContactPayload", () => {
  it("succeeds for a valid payload", () => {
    const result = parseContactPayload(validBody());
    expect(result.success).toBe(true);
  });

  it("reports a missing name as required", () => {
    const result = parseContactPayload(validBody({ name: "" }));
    expect(result).toEqual({ success: false, errors: { name: "required" } });
  });

  it("reports a malformed email as invalid_email", () => {
    const result = parseContactPayload(validBody({ email: "not-an-email" }));
    expect(result).toEqual({ success: false, errors: { email: "invalid_email" } });
  });

  it("reports a message under the minimum length as too_short", () => {
    const result = parseContactPayload(validBody({ message: "short" }));
    expect(result).toEqual({ success: false, errors: { message: "too_short" } });
  });

  it("reports a message over the maximum length as too_long", () => {
    const result = parseContactPayload(validBody({ message: "a".repeat(5001) }));
    expect(result).toEqual({ success: false, errors: { message: "too_long" } });
  });

  it("reports a name over the maximum length as too_long", () => {
    const result = parseContactPayload(validBody({ name: "a".repeat(101) }));
    expect(result).toEqual({ success: false, errors: { name: "too_long" } });
  });

  it("reports multiple failing fields at once", () => {
    const result = parseContactPayload(validBody({ name: "", email: "bad" }));
    expect(result).toEqual({
      success: false,
      errors: { name: "required", email: "invalid_email" },
    });
  });

  it("ignores unknown, non-contact-field issues", () => {
    const result = parseContactPayload(null);
    expect(result.success).toBe(false);
  });
});

describe("parseContactBody", () => {
  it("parses a valid JSON body", () => {
    const result = parseContactBody(JSON.stringify(validBody()));
    expect(result.success).toBe(true);
  });

  it("treats malformed JSON as a validation failure with no field errors", () => {
    expect(parseContactBody("not json")).toEqual({ success: false, errors: {} });
  });
});
