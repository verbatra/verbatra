import { describe, expect, it } from "vitest";
import { copyForErrorCode, ERROR_CODE_COPY, resolveErrorCopy } from "./error-copy.js";

const REACHABLE_TODAY_CODES = [
  "REQUEST_INVALID",
  "METHOD_UNKNOWN",
  "PARAMS_INVALID",
  "METHOD_RATE_LIMITED",
  "INTERNAL",
  "SESSION_EXPIRED",
  "NETWORK_ERROR",
  "UNKNOWN_FORMAT",
  "SOURCE_UNREADABLE",
  "SOURCE_INVALID",
  "LOCK_FILE_INVALID",
  "UNKNOWN_LOCALE",
  "UNKNOWN_KEY",
  "KEY_PROTECTED",
  "KEY_PINNED",
  "LOCK_CONTENDED",
  "GLOSSARY_NOT_FILE_BACKED",
  "GLOSSARY_UNWRITABLE",
  "INVALID_JSON",
  "INVALID_YAML",
  "INVALID_XML",
  "INVALID_STRUCTURE",
  "MAX_DEPTH_EXCEEDED",
  "INPUT_TOO_LARGE",
  "MIXED_STRUCTURE",
  "PROVENANCE_FILE_UNWRITABLE",
  "REVIEW_VALUE_CHANGED",
  "REVIEW_SOURCE_CHANGED",
  "REVIEW_REJECT_UNSUPPORTED",
  "REVIEW_RESTORE_FAILED",
];

const PROVIDER_CODES = ["RATE_LIMITED", "AUTH_FAILED", "TIMEOUT", "PROVIDER_UNAVAILABLE"];

const GENERIC_MESSAGE = "Something went wrong on the server.";

describe("copyForErrorCode", () => {
  it.each(REACHABLE_TODAY_CODES)(
    "has distinct, specific copy for the reachable-today code %s",
    (code) => {
      const copy = copyForErrorCode(code);

      expect(copy).toBeDefined();
      expect(copy).not.toBe(GENERIC_MESSAGE);
      expect(copy?.length).toBeGreaterThan(0);
    },
  );

  it.each(PROVIDER_CODES)("has distinct, specific copy for the provider code %s", (code) => {
    const copy = copyForErrorCode(code);

    expect(copy).toBeDefined();
    expect(copy).not.toBe(GENERIC_MESSAGE);
  });

  it("maps METHOD_RATE_LIMITED to copy naming Studio's own throttle, never the provider", () => {
    expect(copyForErrorCode("METHOD_RATE_LIMITED")).toBe(
      "Studio is limiting how often this action can run. Wait a moment and try again.",
    );
  });

  it("maps RATE_LIMITED to the provider copy, distinct from the Studio throttle copy", () => {
    expect(copyForErrorCode("RATE_LIMITED")).toBe(
      "The translation provider is rate-limiting requests. Wait a moment and try again.",
    );
    expect(copyForErrorCode("RATE_LIMITED")).not.toBe(copyForErrorCode("METHOD_RATE_LIMITED"));
  });

  it("maps PROVENANCE_FILE_INVALID to copy naming the provenance file and that nothing was written", () => {
    const copy = copyForErrorCode("PROVENANCE_FILE_INVALID");

    expect(copy).toContain("verbatra.provenance.json");
    expect(copy).toContain("nothing was written");
    expect(copy).not.toBe(copyForErrorCode("LOCK_FILE_INVALID"));
  });

  it("returns undefined for a code not in the table", () => {
    expect(copyForErrorCode("SOMETHING_UNKNOWN")).toBeUndefined();
  });

  it.each(["constructor", "toString", "hasOwnProperty", "__proto__", "valueOf"])(
    "returns undefined for the inherited Object.prototype member name %s",
    (code) => {
      expect(copyForErrorCode(code)).toBeUndefined();
    },
  );

  it("every code in the table maps to a non-empty string", () => {
    for (const copy of Object.values(ERROR_CODE_COPY)) {
      expect(typeof copy).toBe("string");
      expect(copy.length).toBeGreaterThan(0);
    }
  });
});

describe("resolveErrorCopy", () => {
  it("returns the specific copy for a known code", () => {
    const resolved = resolveErrorCopy({ code: "SESSION_EXPIRED", message: GENERIC_MESSAGE });

    expect(resolved).toBe(copyForErrorCode("SESSION_EXPIRED"));
    expect(resolved).not.toBe(GENERIC_MESSAGE);
  });

  it("falls back to the error's own message for an unmapped code", () => {
    const resolved = resolveErrorCopy({ code: "SOMETHING_UNKNOWN", message: GENERIC_MESSAGE });

    expect(resolved).toBe(GENERIC_MESSAGE);
  });

  it("renders the server's METHOD_RATE_LIMITED envelope with the Studio throttle copy", () => {
    const resolved = resolveErrorCopy({
      code: "METHOD_RATE_LIMITED",
      message: "Too many calls to this method; wait before retrying.",
    });

    expect(resolved).toBe(
      "Studio is limiting how often this action can run. Wait a moment and try again.",
    );
  });

  it("renders a forwarded provider RATE_LIMITED error with the provider copy", () => {
    const resolved = resolveErrorCopy({
      code: "RATE_LIMITED",
      message: "provider answered 429",
    });

    expect(resolved).toBe(
      "The translation provider is rate-limiting requests. Wait a moment and try again.",
    );
  });
});

describe("resolveErrorCopy: a rate limit with a retry time", () => {
  it("names the seconds to wait instead of a moment", () => {
    expect(
      resolveErrorCopy({ code: "METHOD_RATE_LIMITED", message: "raw", retryAfterSeconds: 30 }),
    ).toBe("Studio is limiting how often this action can run. Try again in 30 seconds.");
    expect(
      resolveErrorCopy({ code: "METHOD_RATE_LIMITED", message: "raw", retryAfterSeconds: 1 }),
    ).toBe("Studio is limiting how often this action can run. Try again in 1 second.");
  });

  it("keeps the copy of another code that carries a retry time", () => {
    expect(
      resolveErrorCopy({ code: "BATCH_TOO_LARGE", message: "raw", retryAfterSeconds: 30 }),
    ).toBe(ERROR_CODE_COPY.BATCH_TOO_LARGE);
  });
});
