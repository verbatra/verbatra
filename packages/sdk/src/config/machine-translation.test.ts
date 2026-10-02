import { describe, expect, it } from "vitest";
import { SdkError } from "../errors.js";
import { baseConfig } from "../test-support.js";
import {
  assertMachineTranslationEnabled,
  isMachineTranslationEnabled,
} from "./machine-translation.js";

describe("isMachineTranslationEnabled", () => {
  it("is true for every configured translation provider", () => {
    expect(isMachineTranslationEnabled(baseConfig())).toBe(true);
    expect(isMachineTranslationEnabled({ provider: { id: "deepl", options: {} } })).toBe(true);
  });

  it("is false for provider none", () => {
    expect(isMachineTranslationEnabled({ provider: { id: "none", options: {} } })).toBe(false);
  });
});

describe("assertMachineTranslationEnabled", () => {
  it("returns quietly when a provider is configured", () => {
    expect(() => assertMachineTranslationEnabled(baseConfig(), "anything")).not.toThrow();
  });

  it("throws MACHINE_TRANSLATION_DISABLED naming the refused action for provider none", () => {
    let caught: unknown;
    try {
      assertMachineTranslationEnabled(
        { provider: { id: "none", options: {} } },
        "translating pending keys",
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SdkError);
    expect(caught).toMatchObject({ code: "MACHINE_TRANSLATION_DISABLED" });
    expect((caught as SdkError).message).toContain("translating pending keys");
    expect((caught as SdkError).message).toContain('provider "none"');
  });
});
