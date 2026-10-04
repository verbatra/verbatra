import { PAGE_LIMIT_CAP, PAGE_LIMIT_DEFAULT } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import {
  agentLocaleValuesParamsSchema,
  LOCALE_VALUES_PAGE_LIMIT_CAP,
  LOCALE_VALUES_PAGE_LIMIT_DEFAULT,
} from "./locale-values.js";

describe("locale.values paging parameters", () => {
  it("advertise the same default and cap the SDK applies", () => {
    expect(LOCALE_VALUES_PAGE_LIMIT_DEFAULT).toBe(PAGE_LIMIT_DEFAULT);
    expect(LOCALE_VALUES_PAGE_LIMIT_CAP).toBe(PAGE_LIMIT_CAP);
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
