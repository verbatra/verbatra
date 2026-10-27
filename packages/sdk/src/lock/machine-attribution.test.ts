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

describe("machineAttribution: resolved provider id", () => {
  it("keeps the configured model when the resolved provider answers under the configured id", () => {
    expect(
      machineAttribution(
        { id: "openai", options: { model: "gpt-x", maxOutputTokens: 10 } },
        "openai",
      ),
    ).toEqual({ provider: "openai", model: "gpt-x" });
  });

  it("names the resolved provider alone when it answers under a different id", () => {
    expect(
      machineAttribution(
        { id: "gemini", options: { model: "gemini-x", maxOutputTokens: 10 } },
        "my-provider",
      ),
    ).toEqual({ provider: "my-provider" });
  });

  it("names nothing in human-only mode whatever id is passed", () => {
    expect(machineAttribution({ id: "none", options: {} }, "my-provider")).toBeUndefined();
  });
});
