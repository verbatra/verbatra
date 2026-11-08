import { describe, expect, it } from "vitest";
import {
  LIMIT_RANGE_MESSAGE,
  limitControlView,
  limitCountText,
  MAX_LIMIT,
  ORPHAN_LIMIT_NOTE,
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
    "",
    "   ",
    "0",
    "000",
    "-1",
    "+5",
    "1.5",
    "1,5",
    "NaN",
    "5e2",
    "1e21",
    "0x10",
    "1_000",
    "5 0",
    "٣",
    "５",
    "9007199254740992",
    "99999999999999999999999",
  ])("refuses %j with the one range message", (text) => {
    expect(parseLimitInput(text)).toEqual({ kind: "error", message: LIMIT_RANGE_MESSAGE });
  });

  it("states the range once, with the cap in readable groups", () => {
    expect(LIMIT_RANGE_MESSAGE).toBe(
      "Enter a whole number from 1 to 9,007,199,254,740,991, digits only.",
    );
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

  it("treats a source without a value as no limit rather than inventing one", () => {
    expect(
      limitControlView({
        maxLength: undefined,
        maxLengthSource: "config",
        limitsNotice: undefined,
      }),
    ).toMatchObject({ mode: "none", value: undefined });
    expect(
      limitControlView({
        maxLength: undefined,
        maxLengthSource: "limits-file",
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

describe("ORPHAN_LIMIT_NOTE", () => {
  it("says Studio sets limits only for source keys and that a limit written for the key still applies", () => {
    expect(ORPHAN_LIMIT_NOTE).toContain("only for keys in the source file");
    expect(ORPHAN_LIMIT_NOTE).toContain("still applies");
    expect(ORPHAN_LIMIT_NOTE).not.toMatch(/has none|has no (length )?limit/);
  });
});
