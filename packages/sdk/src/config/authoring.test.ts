import type { AnthropicModel, GeminiModel, OpenAiModel } from "@verbatra/ai-providers";
import { describe, expect, it } from "vitest";
import { baseConfig } from "../test-support.js";
import type { AuthoringConfig, AuthoringConfigFor } from "./authoring.js";
import { defineConfig } from "./define-config.js";
import { loadConfig } from "./load-config.js";

type Extends<A, B> = A extends B ? true : false;
type Expect<T extends true> = T;

type LiteralMembers<T> = T extends string ? (string extends T ? never : T) : never;

type ModelOf<Id extends AuthoringConfig["provider"]["id"]> =
  Extract<AuthoringConfig["provider"], { id: Id }> extends { options: { model: infer M } }
    ? M
    : never;

type AnthropicModelField = ModelOf<"anthropic">;
type OpenAiModelField = ModelOf<"openai">;
type GeminiModelField = ModelOf<"gemini">;

type CollapsedModelOf<Id extends "anthropic" | "openai" | "gemini"> =
  AuthoringConfigFor<Id>["provider"] extends { options: { model: infer M } } ? M : never;

type CollapsedAnthropic = CollapsedModelOf<"anthropic">;
type CollapsedOpenAi = CollapsedModelOf<"openai">;
type CollapsedGemini = CollapsedModelOf<"gemini">;

describe("provider model authoring suggestions (type-level)", () => {
  it("offers each provider's known SDK model literal as an assignable completion", () => {
    type Assertions = [
      Expect<Extends<"claude-opus-4-8", AnthropicModelField>>,
      Expect<Extends<"gpt-4o", OpenAiModelField>>,
      Expect<Extends<"gemini-2.5-flash", GeminiModelField>>,
    ];
    const assertions: Assertions = [true, true, true];
    expect(assertions).toEqual([true, true, true]);
  });

  it("sources each authoring field from the matching SDK model type", () => {
    type Assertions = [
      Expect<Extends<LiteralMembers<AnthropicModelField>, LiteralMembers<AnthropicModel>>>,
      Expect<Extends<LiteralMembers<AnthropicModel>, LiteralMembers<AnthropicModelField>>>,
      Expect<Extends<LiteralMembers<OpenAiModelField>, LiteralMembers<OpenAiModel>>>,
      Expect<Extends<LiteralMembers<OpenAiModel>, LiteralMembers<OpenAiModelField>>>,
      Expect<Extends<LiteralMembers<GeminiModelField>, LiteralMembers<GeminiModel>>>,
      Expect<Extends<LiteralMembers<GeminiModel>, LiteralMembers<GeminiModelField>>>,
    ];
    const assertions: Assertions = [true, true, true, true, true, true];
    expect(assertions).toEqual([true, true, true, true, true, true]);
  });

  it("narrows suggestions by provider id: a foreign literal is not a named member", () => {
    type Assertions = [
      Expect<Extends<Extends<"gpt-4o", LiteralMembers<AnthropicModelField>>, false>>,
      Expect<Extends<Extends<"gemini-2.5-flash", LiteralMembers<AnthropicModelField>>, false>>,
      Expect<Extends<Extends<"claude-opus-4-8", LiteralMembers<OpenAiModelField>>, false>>,
      Expect<Extends<Extends<"gemini-2.5-flash", LiteralMembers<OpenAiModelField>>, false>>,
      Expect<Extends<Extends<"claude-opus-4-8", LiteralMembers<GeminiModelField>>, false>>,
      Expect<Extends<Extends<"gpt-4o", LiteralMembers<GeminiModelField>>, false>>,
    ];
    const assertions: Assertions = [true, true, true, true, true, true];
    expect(assertions).toEqual([true, true, true, true, true, true]);
  });

  it("rejects an unknown or foreign model string for every LLM provider (closed union)", () => {
    type Assertions = [
      Expect<Extends<Extends<"some-future-model-2099", AnthropicModelField>, false>>,
      Expect<Extends<Extends<"some-future-model-2099", OpenAiModelField>, false>>,
      Expect<Extends<Extends<"some-future-model-2099", GeminiModelField>, false>>,
    ];
    const assertions: Assertions = [true, true, true];
    expect(assertions).toEqual([true, true, true]);
  });

  it("collapses defineConfig to the selected provider's model union for a literal id", () => {
    type Assertions = [
      Expect<Extends<LiteralMembers<CollapsedOpenAi>, LiteralMembers<OpenAiModel>>>,
      Expect<Extends<LiteralMembers<OpenAiModel>, LiteralMembers<CollapsedOpenAi>>>,
      Expect<Extends<LiteralMembers<CollapsedAnthropic>, LiteralMembers<AnthropicModel>>>,
      Expect<Extends<LiteralMembers<AnthropicModel>, LiteralMembers<CollapsedAnthropic>>>,
      Expect<Extends<LiteralMembers<CollapsedGemini>, LiteralMembers<GeminiModel>>>,
      Expect<Extends<LiteralMembers<GeminiModel>, LiteralMembers<CollapsedGemini>>>,
      Expect<Extends<Extends<"claude-opus-4-8", CollapsedOpenAi>, false>>,
      Expect<Extends<Extends<"gemini-2.5-flash", CollapsedOpenAi>, false>>,
      Expect<Extends<Extends<"gpt-4o", CollapsedAnthropic>, false>>,
      Expect<Extends<Extends<"claude-opus-4-8", CollapsedGemini>, false>>,
      Expect<Extends<Extends<"gpt-4o", CollapsedGemini>, false>>,
      Expect<Extends<Extends<"some-future-model-2099", CollapsedOpenAi>, false>>,
      Expect<Extends<Extends<"some-future-model-2099", CollapsedAnthropic>, false>>,
      Expect<Extends<Extends<"some-future-model-2099", CollapsedGemini>, false>>,
    ];
    const assertions: Assertions = [
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ];
    expect(assertions).toEqual(assertions.map(() => true));
  });

  it("defineConfig lets a none provider leave out options and fills in the empty object", () => {
    const config = defineConfig({
      sourceLocale: "en",
      targetLocales: ["de"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
      provider: { id: "none" },
    });
    expect(config.provider).toEqual({ id: "none", options: {} });
  });

  it("defineConfig accepts a known model ID and returns the runtime config unchanged", () => {
    const config = defineConfig({
      sourceLocale: "en",
      targetLocales: ["de"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
      provider: { id: "anthropic", options: { model: "claude-opus-4-8", maxTokens: 256 } },
    });
    expect(config.provider).toMatchObject({ options: { model: "claude-opus-4-8" } });
  });

  it("defineConfig rejects a foreign provider's model at author time (type error)", () => {
    defineConfig({
      sourceLocale: "en",
      targetLocales: ["de"],
      format: "next-intl-json",
      files: { pattern: "messages/{locale}.json" },
      // @ts-expect-error - "claude-opus-4-8" is a Claude model, not a Gemini model
      provider: { id: "gemini", options: { model: "claude-opus-4-8", maxOutputTokens: 256 } },
    });
    expect(true).toBe(true);
  });

  it("defineConfig rejects an unknown model at author time (type error)", () => {
    defineConfig({
      sourceLocale: "en",
      targetLocales: ["de"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
      // @ts-expect-error - the closed union no longer accepts an unlisted model ID
      provider: { id: "openai", options: { model: "gpt-future-2099", maxOutputTokens: 256 } },
    });
    expect(true).toBe(true);
  });
});

describe("an unknown model still loads at runtime and reaches provider construction unchanged", () => {
  it("passes loadConfig without error and preserves the model verbatim", async () => {
    const config = await loadConfig({
      configOverride: baseConfig({
        provider: { id: "anthropic", options: { model: "some-future-model-2099", maxTokens: 8 } },
      }),
    });
    expect(config.provider).toEqual({
      id: "anthropic",
      options: { model: "some-future-model-2099", maxTokens: 8 },
    });
  });
});
