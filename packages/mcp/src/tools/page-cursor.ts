import { PAGE_CURSOR_MAX_LENGTH, PAGE_LIMIT_CAP, SdkError } from "@verbatra/sdk";
import { z } from "zod";
import { McpInvalidParamsError } from "./define-tool.js";

export const pageLimitSchema = z.number().int().min(1).max(PAGE_LIMIT_CAP).optional();
export const pageCursorSchema = z.string().min(1).max(PAGE_CURSOR_MAX_LENGTH).optional();

const STALE_CURSOR =
  "the cursor no longer matches the project or these parameters; call again without a cursor.";

export async function asInvalidCursor<Result>(read: () => Promise<Result>): Promise<Result> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof SdkError && error.code === "PAGE_CURSOR_INVALID") {
      throw new McpInvalidParamsError("cursor", STALE_CURSOR);
    }
    throw error;
  }
}
