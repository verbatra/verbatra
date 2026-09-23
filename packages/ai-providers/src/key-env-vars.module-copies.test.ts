import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDeclaredKeyEnvVars } from "./test-support.js";

const NAME = "MODULE_COPY_TEST_KEY";
const FAKE_KEY = "fake-module-copy-key";

describe("declared key variables: shared across module copies", () => {
  let saved: string | undefined;

  beforeEach(() => {
    resetDeclaredKeyEnvVars();
    saved = process.env[NAME];
    process.env[NAME] = FAKE_KEY;
  });

  afterEach(() => {
    resetDeclaredKeyEnvVars();
    if (saved === undefined) {
      delete process.env[NAME];
    } else {
      process.env[NAME] = saved;
    }
  });

  it("scrubs in one copy a variable declared through another", async () => {
    vi.resetModules();
    const declaringCopy = await import("./key-env-vars.js");
    vi.resetModules();
    const redactingCopy = await import("./redaction.js");
    const redactingRegistry = await import("./key-env-vars.js");

    expect(redactingRegistry.declareKeyEnvVar).not.toBe(declaringCopy.declareKeyEnvVar);
    expect(redactingCopy.redactKeys(`x ${FAKE_KEY}`)).toBe(`x ${FAKE_KEY}`);

    declaringCopy.declareKeyEnvVar(NAME);

    expect(redactingCopy.redactKeys(`x ${FAKE_KEY}`)).toBe("x [REDACTED]");
  });
});
