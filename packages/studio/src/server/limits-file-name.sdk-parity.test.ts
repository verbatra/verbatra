import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LIMITS_FILE_NAME } from "./watcher.js";

const SDK_SOURCE = fileURLToPath(
  new URL("../../../sdk/src/config/limits-file.ts", import.meta.url),
);

describe("the watched limits file name", () => {
  it("is the file name the sdk reads and writes", () => {
    const declared = /export const LIMITS_FILE_NAME = "([^"]+)";/.exec(
      readFileSync(SDK_SOURCE, "utf8"),
    );

    expect(declared?.[1]).toBe(LIMITS_FILE_NAME);
  });
});
