import { SdkError } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { McpInvalidParamsError } from "./define-tool.js";
import { asInvalidCursor } from "./page-cursor.js";

describe("asInvalidCursor", () => {
  it("turns a stale cursor into invalid input for the cursor field, worded as before", async () => {
    const read = asInvalidCursor(async () => {
      throw new SdkError("PAGE_CURSOR_INVALID", "The cursor no longer matches.");
    });

    await expect(read).rejects.toBeInstanceOf(McpInvalidParamsError);
    await expect(read).rejects.toThrow(
      'Invalid input for field "cursor": the cursor no longer matches the project or these parameters; call again without a cursor.',
    );
  });

  it("passes any other error through unchanged, a bad limit included", async () => {
    const error = new SdkError("PAGE_LIMIT_INVALID", "The page limit must be a whole number.");

    await expect(
      asInvalidCursor(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });

  it("returns the result of a read that succeeds", async () => {
    await expect(asInvalidCursor(async () => 42)).resolves.toBe(42);
  });
});
