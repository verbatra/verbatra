import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ALLOWED_HOST_PATTERN } from "./allowed-host.js";

const HOST_LABEL = "[a-zA-Z0-9_](?:[a-zA-Z0-9_-]*[a-zA-Z0-9_])?";
const BACKTRACKING_PATTERN = new RegExp(
  `^(?:(?:\\*\\.${HOST_LABEL}(?:\\.${HOST_LABEL})+|${HOST_LABEL}(?:\\.${HOST_LABEL})*)\\.?|[0-9a-fA-F:.]*:[0-9a-fA-F:.]*(?:/\\d{1,3})?|\\d{1,3}(?:\\.\\d{1,3}){3}(?:/\\d{1,2})?)$`,
);
const host = fc
  .array(fc.constantFrom(":", "::", ".", "a", "f", "0", "1", "g", "-", "_", "*", "/", "/64", " "), {
    maxLength: 16,
  })
  .map((parts) => parts.join(""));

describe("ALLOWED_HOST_PATTERN", () => {
  it("accepts exactly what the backtracking pattern accepted", () => {
    fc.assert(
      fc.property(host, (value) => {
        expect(ALLOWED_HOST_PATTERN.test(value)).toBe(BACKTRACKING_PATTERN.test(value));
      }),
      { numRuns: 5000 },
    );
  });
});
