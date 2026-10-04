import {
  LOCALE_VALUES_QUERY_MAX_LENGTH,
  PAGE_CURSOR_MAX_LENGTH,
  PAGE_LIMIT_CAP,
  PAGE_LIMIT_DEFAULT,
} from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import {
  agentLocaleValuesParamsSchema,
  LOCALE_VALUES_CURSOR_MAX_LENGTH,
  LOCALE_VALUES_PAGE_LIMIT_CAP,
  LOCALE_VALUES_PAGE_LIMIT_DEFAULT,
  LOCALE_VALUES_QUERY_MAX_LENGTH as STUDIO_QUERY_MAX_LENGTH,
} from "./locale-values.js";

describe("locale.values paging parameters", () => {
  it("advertise the same default, cap and lengths the SDK and the MCP server use", () => {
    expect(LOCALE_VALUES_PAGE_LIMIT_DEFAULT).toBe(PAGE_LIMIT_DEFAULT);
    expect(LOCALE_VALUES_PAGE_LIMIT_CAP).toBe(PAGE_LIMIT_CAP);
    expect(STUDIO_QUERY_MAX_LENGTH).toBe(LOCALE_VALUES_QUERY_MAX_LENGTH);
    expect(LOCALE_VALUES_CURSOR_MAX_LENGTH).toBe(PAGE_CURSOR_MAX_LENGTH);
  });

  it.each([
    [{ keys: Array.from({ length: PAGE_LIMIT_CAP }, (_, i) => `k${i}`) }, true],
    [{ keys: Array.from({ length: PAGE_LIMIT_CAP + 1 }, (_, i) => `k${i}`) }, false],
    [{ query: "q".repeat(LOCALE_VALUES_QUERY_MAX_LENGTH) }, true],
    [{ query: "q".repeat(LOCALE_VALUES_QUERY_MAX_LENGTH + 1) }, false],
    [{ cursor: "c".repeat(PAGE_CURSOR_MAX_LENGTH) }, true],
    [{ cursor: "c".repeat(PAGE_CURSOR_MAX_LENGTH + 1) }, false],
  ])("bounds keys, query and cursor at the SDK lengths (case %#)", (params, accepted) => {
    expect(agentLocaleValuesParamsSchema.safeParse(params).success).toBe(accepted);
  });

  it.each([
    [{}, true],
    [{ locales: ["de"], query: "hi", limit: 5, cursor: "abc" }, true],
    [{ keys: ["a"], query: "a" }, false],
    [{ paged: true }, false],
    [{ limit: 0 }, false],
  ])("accepts %j from an agent: %s", (params, accepted) => {
    expect(agentLocaleValuesParamsSchema.safeParse(params).success).toBe(accepted);
  });
});
