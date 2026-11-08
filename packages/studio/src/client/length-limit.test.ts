import { describe, expect, it } from "vitest";
import {
  limitControlView,
  limitCountText,
  limitReasonFor,
  MAX_LIMIT,
  NO_LIMIT_FOR_UNKNOWN_KEY,
  parseLimitInput,
} from "./length-limit.js";

describe("parseLimitInput", () => {
  it.each([
    ["1", 1],
    ["40", 40],
    ["  40  ", 40],
    ["007", 7],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ])("accepts %j as %d", (text, value) => {
    expect(parseLimitInput(text)).toEqual({ kind: "ok", value });
  });

  it.each([
    ["", /whole number/],
    ["   ", /whole number/],
    ["0", /at least 1/],
    ["000", /at least 1/],
    ["-1", /digits only/],
    ["+5", /digits only/],
    ["1.5", /digits only/],
    ["1,5", /digits only/],
    ["NaN", /digits only/],
    ["5e2", /digits only/],
    ["1e21", /digits only/],
    ["0x10", /digits only/],
    ["1_000", /digits only/],
    ["5 0", /digits only/],
    ["٣", /digits only/],
    ["５", /digits only/],
    ["9007199254740992", /at most 9007199254740991/],
    ["99999999999999999999999", /at most 9007199254740991/],
  ])("refuses %j with inline text", (text, message) => {
    const parsed = parseLimitInput(text);

    expect(parsed.kind).toBe("error");
    expect(parsed.kind === "error" && parsed.message).toMatch(message);
  });

  it("names the same maximum the sdk accepts", () => {
    expect(MAX_LIMIT).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("limitControlView", () => {
  const NOTICE = {
    code: "LIMITS_FILE_IGNORED",
    message: "the file is not a regular file",
  } as const;

  it("is read-only for a limit the config sets, also while the file is unusable", () => {
    expect(
      limitControlView({ maxLength: 5, maxLengthSource: "config", limitsNotice: undefined }),
    ).toEqual({ mode: "config", value: 5, notice: undefined });
    expect(
      limitControlView({ maxLength: 5, maxLengthSource: "config", limitsNotice: NOTICE }),
    ).toMatchObject({ mode: "config", notice: NOTICE.message });
  });

  it("is editable for a limit from the file and for a key without one", () => {
    expect(
      limitControlView({ maxLength: 9, maxLengthSource: "limits-file", limitsNotice: undefined }),
    ).toMatchObject({ mode: "file", value: 9 });
    expect(
      limitControlView({
        maxLength: undefined,
        maxLengthSource: undefined,
        limitsNotice: undefined,
      }),
    ).toMatchObject({ mode: "none", value: undefined });
  });

  it("blocks writes and carries the sdk's own words when the file is unusable", () => {
    expect(
      limitControlView({ maxLength: undefined, maxLengthSource: undefined, limitsNotice: NOTICE }),
    ).toEqual({ mode: "blocked", value: undefined, notice: NOTICE.message });
  });
});

describe("limitCountText", () => {
  it("pluralises the unit", () => {
    expect(limitCountText(1)).toBe("1 character");
    expect(limitCountText(2)).toBe("2 characters");
  });
});

describe("limitReasonFor", () => {
  it("says why a key that is not in the source has no limit, and nothing for another failure", () => {
    expect(limitReasonFor({ code: "UNKNOWN_KEY" })).toBe(NO_LIMIT_FOR_UNKNOWN_KEY);
    expect(limitReasonFor({ code: "INTERNAL" })).toBeUndefined();
  });
});
