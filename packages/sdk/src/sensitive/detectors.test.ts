import { describe, expect, it } from "vitest";
import type { SensitiveDetectorId } from "../config/sensitive-config.js";
import { detectorSpans, isCardNumber, passesLuhn } from "./detectors.js";
import { isValidIban } from "./iban.js";

function found(id: SensitiveDetectorId, text: string): string[] {
  return detectorSpans(id, text).map((span) => text.slice(span.start, span.end));
}

describe("the secret detector", () => {
  it.each([
    ["an OpenAI-style key", "key sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z here", "sk-proj-"],
    ["an AWS access key id", "use AKIAIOSFODNN7EXAMPLE now", "AKIAIOSFODNN7EXAMPLE"],
    [
      "a JWT",
      "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
      "eyJhbGciOiJIUzI1NiJ9",
    ],
    ["a private key header", "-----BEGIN RSA PRIVATE KEY-----", "-----BEGIN RSA PRIVATE KEY-----"],
    ["a bare private key header", "-----BEGIN PRIVATE KEY-----", "-----BEGIN PRIVATE KEY-----"],
  ])("finds %s", (_name, text, expected) => {
    expect(found("secret", text).join(" ")).toContain(expected);
  });

  it.each([
    "Press sk-SK to switch",
    "The AKIA prefix marks an AWS key",
    "eyJ alone is not a token",
    "-----BEGIN CERTIFICATE-----",
  ])("ignores %s", (text) => {
    expect(found("secret", text)).toEqual([]);
  });
});

describe("the email detector", () => {
  it("finds a real address", () => {
    expect(found("email", "Write to support@acme.io today")).toEqual(["support@acme.io"]);
  });

  it.each([
    "Write to jane@example.com",
    "Write to jane@mail.example.org",
    "Write to a@b.test",
    "Hello {{email}}, your login is {{user}}@{{domain}}",
    "{email, select, other {Mail us}}",
    "See https://acme.io/help?ref=docs",
    "Use logo@2x.png on retina screens",
    "Use icon@3x.webp and hero@1.5x.jpg",
    "Version pkg@1.2.34",
    "Mention @acme.io alone",
  ])("ignores %s", (text) => {
    expect(found("email", text)).toEqual([]);
  });

  it("drops trailing sentence punctuation and finds each of several addresses", () => {
    expect(found("email", "Mail a@acme.io. Or b.c@mail.acme.co.uk-")).toEqual([
      "a@acme.io",
      "b.c@mail.acme.co.uk",
    ]);
  });

  it("does not let one address reach across another @", () => {
    expect(found("email", "x@y@acme.io")).toEqual(["y@acme.io"]);
  });
});

describe("the iban detector", () => {
  it.each([
    ["compact", "Pay DE89370400440532013000 now", "DE89370400440532013000"],
    ["grouped", "IBAN: GB82 WEST 1234 5698 7654 32", "GB82 WEST 1234 5698 7654 32"],
    [
      "grouped and followed by a word",
      "DE89 3704 0044 0532 0130 00 OK",
      "DE89 3704 0044 0532 0130 00",
    ],
  ])("finds a %s IBAN", (_name, text, expected) => {
    expect(found("iban", text)).toEqual([expected]);
  });

  it("ignores a look-alike that fails the checksum", () => {
    expect(found("iban", "Ref DE00370400440532013000")).toEqual([]);
  });

  it("checks the mod-97 checksum and the country's length", () => {
    expect(isValidIban("DE89370400440532013000")).toBe(true);
    expect(isValidIban("DE88370400440532013000")).toBe(false);
    expect(isValidIban("DE8937")).toBe(false);
    expect(isValidIban("NO9386011117947")).toBe(true);
    expect(isValidIban("ZZ89370400440532013000")).toBe(false);
  });

  it("stops at the country's length and ignores one that runs on", () => {
    expect(found("iban", "NO93 8601 1117 947 is the account")).toEqual(["NO93 8601 1117 947"]);
    expect(found("iban", "DE8937040044053201300012")).toEqual([]);
  });
});

describe("the credit-card detector", () => {
  it.each([
    ["Visa", "Card 4111 1111 1111 1111 on file", "4111 1111 1111 1111"],
    ["Mastercard", "Card 5555-5555-5555-4444", "5555-5555-5555-4444"],
    ["Amex", "Card 378282246310005", "378282246310005"],
  ])("finds a %s number", (_name, text, expected) => {
    expect(found("credit-card", text)).toEqual([expected]);
  });

  it.each([
    ["an order number failing Luhn", "Order 4111111111111112"],
    ["an order number passing Luhn with no card prefix", "Order 1234567812345670"],
    ["a version string", "Build 4.1.1.1111111111111"],
    ["a short number", "Code 41111111"],
  ])("ignores %s", (_name, text) => {
    expect(found("credit-card", text)).toEqual([]);
  });

  it("requires a length the card brand issues", () => {
    expect(isCardNumber("4111111111111111")).toBe(true);
    expect(isCardNumber("411111111111111")).toBe(false);
    expect(isCardNumber("378282246310005")).toBe(true);
    expect(isCardNumber("3782822463100050")).toBe(false);
    expect(isCardNumber("2221000000000009")).toBe(true);
    expect(isCardNumber("6011111111111117")).toBe(true);
  });

  it("applies the Luhn checksum", () => {
    expect(passesLuhn("4111111111111111")).toBe(true);
    expect(passesLuhn("4111111111111112")).toBe(false);
  });
});

describe("the phone detector", () => {
  it.each([
    ["E.164", "Call +4930123456789", "+4930123456789"],
    ["grouped", "Call +1 (415) 555-2671 now", "+1 (415) 555-2671"],
  ])("finds an %s number", (_name, text, expected) => {
    expect(found("phone", text)).toEqual([expected]);
  });

  it.each(["Call 030 1234567", "Released 2026-10-02", "Version 1.2.3", "Score +12"])(
    "ignores %s",
    (text) => {
      expect(found("phone", text)).toEqual([]);
    },
  );
});

describe("the ip detector", () => {
  it.each([
    ["IPv4", "Server 151.101.1.69 is down", "151.101.1.69"],
    ["IPv6", "Server 2a00:1450:4001:82a:0:0:0:200e is down", "2a00:1450:4001:82a:0:0:0:200e"],
    ["compressed IPv6", "Server 2a00:1450::200e is down", "2a00:1450::200e"],
  ])("finds an %s address", (_name, text, expected) => {
    expect(found("ip", text)).toEqual([expected]);
  });

  it.each([
    "Version v1.2.3.4",
    "Version 1.2.3",
    "Octet 256.1.1.1",
    "Local 127.0.0.1 and ::1",
    "At 12:30:45",
    "Use std::vector",
    "Docs use 192.0.2.10, 198.51.100.7 and 203.0.113.7",
    "Docs use 2001:db8::1 and 2001:0db8:85a3::7334",
  ])("ignores %s", (text) => {
    expect(found("ip", text)).toEqual([]);
  });
});

describe("the private-host detector", () => {
  it.each([
    ["an internal host", "Open https://wiki.acme.internal/page", "wiki.acme.internal"],
    ["a corp host", "Mail jane at ldap.corp", "ldap.corp"],
    ["an RFC 1918 address", "Router 192.168.1.10", "192.168.1.10"],
    ["a 172.16/12 address", "Host 172.20.0.5", "172.20.0.5"],
  ])("finds %s", (_name, text, expected) => {
    expect(found("private-host", text)).toEqual([expected]);
  });

  it.each(["Open https://acme.io/docs", "Public 172.32.0.1", "The local team", "file.local.json"])(
    "ignores %s",
    (text) => {
      expect(found("private-host", text)).toEqual([]);
    },
  );
});

describe("every default and opt-in detector on a 100k-character adversarial input", () => {
  const ADVERSARIAL = [
    "a.".repeat(50_000),
    "a".repeat(100_000),
    "a@".repeat(50_000),
    "a-.".repeat(33_334),
    "1-".repeat(50_000),
    "1.".repeat(50_000),
    "+1 ".repeat(33_334),
    "a:".repeat(50_000),
    "AB12 ".repeat(20_000),
    `${"x.".repeat(50_000)}local`,
  ];
  const IDS = ["secret", "email", "iban", "credit-card", "phone", "ip", "private-host"] as const;

  it.each(IDS)("%s stays linear", (id) => {
    for (const text of ADVERSARIAL) {
      const started = performance.now();
      detectorSpans(id, text);
      expect(performance.now() - started, text.slice(0, 8)).toBeLessThan(1_000);
    }
  });
});
