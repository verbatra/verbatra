import { describe, expect, it } from "vitest";
import { machineAttribution } from "./machine-attribution.js";

describe("machineAttribution", () => {
  it("names the provider and model of an LLM provider", () => {
    expect(
      machineAttribution({ id: "openai", options: { model: "gpt-x", maxOutputTokens: 10 } }),
    ).toEqual({ provider: "openai", model: "gpt-x" });
  });

  it("names only the provider for a machine-translation provider", () => {
    expect(machineAttribution({ id: "deepl", options: {} })).toEqual({ provider: "deepl" });
  });

  it("names nothing in human-only mode", () => {
    expect(machineAttribution({ id: "none", options: {} })).toBeUndefined();
  });
});
