import { LOCALE_HISTORY_LIMIT_CAP } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { HISTORY_MAX, HISTORY_PAGE_SIZE } from "./history-limit.js";

describe("history limit", () => {
  it("stops paging at the most commits the sdk will list", () => {
    expect(HISTORY_MAX).toBe(LOCALE_HISTORY_LIMIT_CAP);
  });

  it("pages in steps that divide the cap evenly, so the last page is full", () => {
    expect(HISTORY_MAX % HISTORY_PAGE_SIZE).toBe(0);
  });
});
