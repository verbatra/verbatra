import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LOCAL_DIR_NAME, RUN_HISTORY_FILE_NAME } from "./watcher.js";

function sdkSource(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../sdk/src/${path}`, import.meta.url)), "utf8");
}

describe("the watched run-history path", () => {
  it("is the directory the sdk keeps local state in", () => {
    const declared = /export const LOCAL_DIR_NAME = "([^"]+)";/.exec(sdkSource("local-dir.ts"));

    expect(declared?.[1]).toBe(LOCAL_DIR_NAME);
  });

  it("is the file name the sdk appends to", () => {
    const declared = /export const RUN_HISTORY_FILE_NAME = "([^"]+)";/.exec(
      sdkSource("run-history/run-history-file.ts"),
    );

    expect(declared?.[1]).toBe(RUN_HISTORY_FILE_NAME);
  });
});
