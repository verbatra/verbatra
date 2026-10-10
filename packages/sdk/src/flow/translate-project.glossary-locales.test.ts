import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  createOpenAiCompatibleProvider,
  type OpenAiCompatibleDeps,
  type TranslationProvider,
} from "@verbatra/ai-providers";
import { describe, expect, it } from "vitest";
import type { GlossaryDefinition } from "../config/glossary.js";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig, makeTempDir, writeJsonFile } from "../test-support.js";
import { translate } from "./translate-project.js";

const GLOSSARY: GlossaryDefinition = {
  version: 2,
  terms: [
    {
      source: "Dashboard",
      targets: { de: "Übersicht", fr: "Tableau de bord" },
      forbidden: { de: ["Instrumententafel"], fr: ["Planche de bord"] },
      note: "The start page after sign-in",
    },
  ],
  doNotTranslate: ["verbatra"],
};

const REPLIES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  de: { title: "Öffne die Instrumententafel", brand: "verbatra Hilfe" },
  fr: { title: "Ouvre le panneau", brand: "Aide de Verbatra" },
};

interface Recorded {
  readonly payloads: Record<string, unknown>[];
  readonly provider: () => TranslationProvider;
}

function recordingProvider(): Recorded {
  const payloads: Record<string, unknown>[] = [];
  const provider = (): TranslationProvider => {
    const client: NonNullable<OpenAiCompatibleDeps["client"]> = {
      chat: {
        completions: {
          create: (request) => {
            const user = request.messages.find((message) => message.role === "user");
            const payload = JSON.parse(String(user?.content)) as Record<string, unknown>;
            payloads.push(payload);
            const reply = REPLIES[String(payload.targetLocale)] ?? {};
            const translations = Object.entries(reply).map(([key, value]) => ({ key, value }));
            return Promise.resolve({
              choices: [{ message: { content: JSON.stringify({ translations }) } }],
            });
          },
        },
      },
    };
    return createOpenAiCompatibleProvider(
      { baseUrl: "http://127.0.0.1:1234/v1", model: "local-model", maxOutputTokens: 1024 },
      { client },
    );
  };
  return { payloads, provider };
}

function config(): VerbatraConfig {
  return baseConfig({
    targetLocales: ["de", "fr"],
    provider: {
      id: "openai-compatible",
      options: { baseUrl: "http://127.0.0.1:1234/v1", model: "local-model", maxOutputTokens: 1024 },
    },
    glossary: GLOSSARY,
  });
}

async function project(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), {
    title: "Open the Dashboard",
    brand: "verbatra help",
  });
  return dir;
}

describe("translate: a per-locale glossary in one run over de and fr", () => {
  it("sends each locale only its own translation and forbidden renderings", async () => {
    const recorded = recordingProvider();
    await translate(
      { config: config(), cwd: await project() },
      { createProvider: recorded.provider },
    );

    const byLocale = Object.fromEntries(
      recorded.payloads.map((payload) => [String(payload.targetLocale), payload]),
    );
    expect(byLocale.de).toMatchObject({
      glossary: { Dashboard: "Übersicht" },
      forbiddenTranslations: { Dashboard: ["Instrumententafel"] },
      glossaryNotes: { Dashboard: { note: "The start page after sign-in" } },
      doNotTranslate: ["verbatra"],
    });
    expect(byLocale.fr).toMatchObject({
      glossary: { Dashboard: "Tableau de bord" },
      forbiddenTranslations: { Dashboard: ["Planche de bord"] },
      doNotTranslate: ["verbatra"],
    });
    expect(JSON.stringify(byLocale.de)).not.toContain("Tableau de bord");
    expect(JSON.stringify(byLocale.fr)).not.toContain("Übersicht");
  });

  it("flags each locale against its own terms", async () => {
    const recorded = recordingProvider();
    const summary = await translate(
      { config: config(), cwd: await project() },
      { createProvider: recorded.provider },
    );

    const needsReview = Object.fromEntries(
      summary.locales.map((locale) => [locale.locale, locale.needsReview]),
    );
    expect(needsReview.de).toEqual([
      { key: "title", reasons: ["GLOSSARY_TERM_MISSED", "GLOSSARY_FORBIDDEN_TERM"] },
    ]);
    expect(needsReview.fr).toEqual([
      { key: "brand", reasons: ["GLOSSARY_TERM_MISSED"] },
      { key: "title", reasons: ["GLOSSARY_TERM_MISSED"] },
    ]);
  });
});
