import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import "./zod-jitless.js";

describe("zod in the Studio client", () => {
  it("runs jitless, so validating never asks the page for eval under its CSP", () => {
    expect(z.config().jitless).toBe(true);
  });

  it("is configured by the first import of the client entry, before any schema is used", () => {
    const main = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
    expect(main.split("\n")[0]).toBe('import "./zod-jitless.js";');
  });
});
