import { KEY_HISTORY_MAX_KEY_CHARS } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { KEY_REVISIONS_KEY_MAX_LENGTH } from "./key-revisions.js";

describe("history.keyRevisions key limit", () => {
  it("copies the SDK's limit, because the browser bundle must not import the SDK's values", () => {
    expect(KEY_REVISIONS_KEY_MAX_LENGTH).toBe(KEY_HISTORY_MAX_KEY_CHARS);
  });
});
