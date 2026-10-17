import {
  createDeepLProvider,
  createGeminiProvider,
  createGoogleTranslateProvider,
  createLibreTranslateProvider,
  type DeepLDeps,
  type GeminiDeps,
  type GoogleTranslateDeps,
  type LibreTranslateDeps,
  type TranslationProvider,
} from "@verbatra/ai-providers";
import type { TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { selectAdapter } from "../selection/select-adapter.js";
import { createSensitiveGuard } from "./guard.js";
import { guardProvider } from "./guarded-provider.js";

const SECRET = "ops@acme.io";
const adapter = selectAdapter("i18next-json");

function entry(key: string, value: string): TranslationEntry {
  return {
    key,
    namespace: "",
    value,
    placeholders: adapter.extractPlaceholders(value),
    isPlural: false,
  };
}

const ENTRIES = [
  entry("contact", `Hi {{name}}, mail ${SECRET} for help`),
  entry("markdown", `**Mail** \`${SECRET}\` or see [the docs](https://docs.acme.io/help).`),
];

interface Wire {
  readonly sent: string[];
  readonly provider: TranslationProvider;
}

function gemini(): Wire {
  const sent: string[] = [];
  const client: NonNullable<GeminiDeps["client"]> = {
    models: {
      generateContent: async (request) => {
        const payload = request.contents[0]?.parts[0]?.text ?? "";
        sent.push(payload);
        const items = (JSON.parse(payload) as { items: { key: string; value: string }[] }).items;
        const translations = items.map((item) => ({ key: item.key, value: `DE ${item.value}` }));
        return { text: JSON.stringify({ translations }), candidates: [{ finishReason: "STOP" }] };
      },
    },
  };
  return {
    sent,
    provider: createGeminiProvider({ model: "m", maxOutputTokens: 1024 }, { client }),
  };
}

function libreTranslate(): Wire {
  const sent: string[] = [];
  const client: NonNullable<LibreTranslateDeps["client"]> = {
    translate: async (texts) => {
      sent.push(...texts);
      return { status: 200, body: { translatedText: texts.map((text) => `DE ${text}`) } };
    },
  };
  return {
    sent,
    provider: createLibreTranslateProvider({ baseUrl: "http://127.0.0.1:5000" }, { client }),
  };
}

function deepL(): Wire {
  const sent: string[] = [];
  const client: NonNullable<DeepLDeps["client"]> = {
    translateText: async (texts) => {
      sent.push(...texts);
      return texts.map((text) => ({ text: `DE ${text}` }));
    },
  };
  return { sent, provider: createDeepLProvider({}, { client, freeAccount: false }) };
}

function google(): Wire {
  const sent: string[] = [];
  const client: NonNullable<GoogleTranslateDeps["client"]> = {
    translate: async (texts) => {
      sent.push(...texts);
      return {
        status: 200,
        body: { data: { translations: texts.map((text) => ({ translatedText: `DE ${text}` })) } },
      };
    },
  };
  return { sent, provider: createGoogleTranslateProvider({}, { client }) };
}

describe.each([
  ["gemini", "llm", gemini],
  ["libretranslate", "machine-translation", libreTranslate],
  ["deepl", "machine-translation", deepL],
  ["google-translate", "machine-translation", google],
] as const)("redact through %s", (_id, kind, wire) => {
  it("sends no matched text and restores it in the translation", async () => {
    const guard = createSensitiveGuard({ mode: "redact" }, kind);
    if (guard === undefined) {
      throw new Error("expected a guard");
    }
    const { sent, provider } = wire();
    const result = await guardProvider(provider, guard).translateBatch({
      sourceLocale: "en",
      targetLocale: "de",
      entries: ENTRIES,
      extractPlaceholders: adapter.extractPlaceholders,
    });

    expect(sent.length).toBeGreaterThan(0);
    expect(sent.join("\n")).not.toContain(SECRET);
    expect(result.values.get("contact")).toBe(`DE Hi {{name}}, mail ${SECRET} for help`);
    expect(result.values.get("markdown")).toBe(
      `DE **Mail** \`${SECRET}\` or see [the docs](https://docs.acme.io/help).`,
    );
  });
});
