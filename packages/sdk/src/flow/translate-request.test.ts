import {
  createDeepLProvider,
  createGeminiProvider,
  createGoogleTranslateProvider,
  createLibreTranslateProvider,
  type DeepLDeps,
  type GeminiDeps,
  type GoogleTranslateDeps,
  type LibreTranslateDeps,
  type TranslateRequest,
  type TranslationProvider,
} from "@verbatra/ai-providers";
import type { TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { selectAdapter } from "../selection/select-adapter.js";
import { createSensitiveGuard, type SensitiveGuard } from "../sensitive/guard.js";
import { guardProvider, sensitiveWithheldOf } from "../sensitive/guarded-provider.js";
import { planSensitive } from "../sensitive/locale-plan.js";
import { buildTranslateRequest, type TranslateRequestContext } from "./translate-request.js";

const SECRET = "ops@acme.io";

function contextFor(format: "vue-i18n-json" | "i18next-json"): TranslateRequestContext {
  return {
    sourceLocale: "en",
    targetLocale: "de",
    adapter: selectAdapter(format),
    glossary: undefined,
    maxLength: undefined,
    tone: undefined,
  };
}

const VUE = contextFor("vue-i18n-json");

function entry(key: string, value: string): TranslationEntry {
  return {
    key,
    namespace: "",
    value,
    placeholders: VUE.adapter.extractPlaceholders(value),
    isPlural: false,
  };
}

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
        sent.push(JSON.stringify(request));
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

function libreTranslate(transform: (text: string) => string = (text) => `DE ${text}`): Wire {
  const sent: string[] = [];
  const client: NonNullable<LibreTranslateDeps["client"]> = {
    translate: async (texts) => {
      sent.push(...texts);
      return { status: 200, body: { translatedText: texts.map(transform) } };
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

describe("buildTranslateRequest", () => {
  it("adds the value's foreign tokens to its placeholders, after the native ones", () => {
    const request = buildTranslateRequest(VUE, [entry("greeting", "Hi {name}, use {{x}}")]);

    expect(request.entries[0]?.placeholders).toEqual(["{name}", "{{x}}"]);
  });

  it("passes an entry without a foreign token through unchanged", () => {
    const plain = entry("greeting", "Hi {name}");

    expect(buildTranslateRequest(VUE, [plain]).entries[0]).toBe(plain);
  });
});

describe.each([
  ["libretranslate", libreTranslate],
  ["deepl", deepL],
  ["google-translate", google],
] as const)("a foreign token through %s", (_id, wire) => {
  it("goes out masked and comes back as written in the source", async () => {
    const { sent, provider } = wire();

    const result = await provider.translateBatch(
      buildTranslateRequest(VUE, [entry("greeting", "Hi {name}, use {{x}} here")]),
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain("{{x}}");
    expect(sent[0]).not.toContain("{name}");
    expect(result.values.get("greeting")).toBe("DE Hi {name}, use {{x}} here");
    expect(result.notices ?? []).toEqual([]);
  });
});

describe("a foreign token that cannot be kept intact", () => {
  it("is withheld with PLACEHOLDER_UNSUPPORTED when the value cannot be masked", async () => {
    const { sent, provider } = libreTranslate();

    const result = await provider.translateBatch(
      buildTranslateRequest(contextFor("i18next-json"), [
        { ...entry("total", "{n, plural, one {# item} other {# items}}"), placeholders: [] },
      ]),
    );

    expect(sent).toEqual([]);
    expect(result.values.has("total")).toBe(false);
    expect(result.notices?.map((notice) => notice.code)).toEqual(["PLACEHOLDER_UNSUPPORTED"]);
  });

  it("is withheld, not written broken, when the marker does not come back", async () => {
    const { provider } = libreTranslate((text) => text.replace("{0}", "x"));

    const result = await provider.translateBatch(
      buildTranslateRequest(VUE, [entry("greeting", "Use {{x}} here")]),
    );

    expect(result.values.has("greeting")).toBe(false);
    expect(result.notices?.map((notice) => notice.code)).toEqual(["PLACEHOLDER_UNSUPPORTED"]);
  });
});

function redactGuard(kind: "llm" | "machine-translation"): SensitiveGuard {
  const guard = createSensitiveGuard({ mode: "redact", patterns: ["secretToken"] }, kind);
  if (guard === undefined) {
    throw new Error("expected a guard");
  }
  return guard;
}

const I18NEXT = contextFor("i18next-json");

function i18nextEntry(key: string, value: string): TranslationEntry {
  return {
    key,
    namespace: "",
    value,
    placeholders: I18NEXT.adapter.extractPlaceholders(value),
    isPlural: false,
  };
}

describe("an LLM request", () => {
  it("is byte-identical with and without the foreign tokens in the placeholders", async () => {
    const entries = [entry("greeting", "Hi {name}, use {{x}} and %s here"), entry("plain", "Save")];
    const built = buildTranslateRequest(VUE, entries);
    const raw: TranslateRequest = { ...built, entries };
    const withForeign = gemini();
    const without = gemini();

    await withForeign.provider.translateBatch(built);
    await without.provider.translateBatch(raw);

    expect(built.entries[0]?.placeholders).toContain("{{x}}");
    expect(withForeign.sent).toHaveLength(1);
    expect(withForeign.sent).toEqual(without.sent);
  });

  it("is byte-identical through the redacting guard, and a match inside a foreign token is still redacted", async () => {
    const entries = [
      i18nextEntry("token", "Your {secretToken} here"),
      i18nextEntry("plain", "Save"),
    ];
    const built = buildTranslateRequest(I18NEXT, entries);
    const raw: TranslateRequest = { ...built, entries };
    const withForeign = gemini();
    const without = gemini();

    const result = await guardProvider(withForeign.provider, redactGuard("llm")).translateBatch(
      built,
    );
    await guardProvider(without.provider, redactGuard("llm")).translateBatch(raw);

    expect(built.entries[0]?.placeholders).toEqual(["{secretToken}"]);
    expect(withForeign.sent).toHaveLength(1);
    expect(withForeign.sent).toEqual(without.sent);
    expect(withForeign.sent[0]).not.toContain("secretToken");
    expect(result.values.get("token")).toBe("DE Your {secretToken} here");
    expect(sensitiveWithheldOf(result).size).toBe(0);
  });
});

describe("the sensitive-data guard and the planned verdict", () => {
  it("decides on the entry the dry-run plan saw, so the memo hits and the verdict matches", async () => {
    const guard = redactGuard("llm");
    const seen: TranslationEntry[] = [];
    const recording: SensitiveGuard = {
      ...guard,
      entry: (candidate) => {
        seen.push(candidate);
        return guard.entry(candidate);
      },
    };
    const entries = [i18nextEntry("token", "Your {secretToken} here")];
    const plan = planSensitive(recording, entries, undefined);

    const result = await guardProvider(gemini().provider, recording).translateBatch(
      buildTranslateRequest(I18NEXT, entries),
    );

    expect(plan.redacted).toEqual(new Set(["token"]));
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(entries[0]);
    expect(guard.entry(entries[0] as TranslationEntry)).toBe(
      guard.entry(seen[1] as TranslationEntry),
    );
    expect(result.values.has("token")).toBe(true);
    expect(sensitiveWithheldOf(result).size).toBe(0);
  });

  it("keeps the redact verdict for machine translation, which then masks or withholds the value", async () => {
    const { sent, provider } = libreTranslate();
    const entries = [i18nextEntry("token", "Your {secretToken} here")];
    const plan = planSensitive(redactGuard("machine-translation"), entries, undefined);

    const result = await guardProvider(provider, redactGuard("machine-translation")).translateBatch(
      buildTranslateRequest(I18NEXT, entries),
    );

    expect(plan.redacted).toEqual(new Set(["token"]));
    expect(sensitiveWithheldOf(result).size).toBe(0);
    expect(sent.join("\n")).not.toContain("secretToken");
    expect(result.values.has("token")).toBe(false);
    expect(result.notices?.map((notice) => notice.code)).toEqual(["PLACEHOLDER_UNSUPPORTED"]);
  });
});

describe("the sensitive-data guard together with a foreign token", () => {
  it("masks both the redaction token and the foreign token, and restores both", async () => {
    const guard = createSensitiveGuard({ mode: "redact" }, "machine-translation");
    if (guard === undefined) {
      throw new Error("expected a guard");
    }
    const { sent, provider } = libreTranslate();

    const result = await guardProvider(provider, guard).translateBatch(
      buildTranslateRequest(VUE, [entry("contact", `Mail ${SECRET} about {{x}}`)]),
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain(SECRET);
    expect(sent[0]).not.toContain("{{x}}");
    expect(sent[0]).not.toContain("__VBR");
    expect(result.values.get("contact")).toBe(`DE Mail ${SECRET} about {{x}}`);
  });
});
