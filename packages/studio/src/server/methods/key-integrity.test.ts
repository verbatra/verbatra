import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LoadedConfig } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { keyIntegrityHandler } from "./key-integrity.js";

function deps(project: FixtureProject): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: project.config,
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  return { config: loaded, projectRoot: project.root };
}

async function writeTargetFile(
  project: FixtureProject,
  locale: string,
  entries: Readonly<Record<string, string>>,
): Promise<void> {
  await writeFile(
    join(project.root, "locales", `${locale}.json`),
    `${JSON.stringify(entries, null, 2)}\n`,
    "utf8",
  );
}

async function writeLockFile(
  project: FixtureProject,
  locale: string,
  baseline: Readonly<Record<string, string>>,
): Promise<void> {
  await writeFile(
    join(project.root, "verbatra.lock.json"),
    `${JSON.stringify({ version: 1, locales: { [locale]: baseline } }, null, 2)}\n`,
    "utf8",
  );
}

describe("keyIntegrityHandler", () => {
  it("reports a matching key with placeholders present on both sides", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de"] },
      { greeting: "Hello {{name}} new" },
    );
    try {
      await writeTargetFile(project, "de", { greeting: "Hallo {{name}}" });
      await writeLockFile(project, "de", { greeting: "old-hash-forces-changed" });

      const result = await keyIntegrityHandler({ key: "greeting" }, deps(project));

      expect(result.locales).toEqual([
        {
          locale: "de",
          hasPlaceholders: true,
          matches: true,
          missing: [],
          extra: [],
          icuValid: true,
          markupMatches: true,
          markupDetails: [],
        },
      ]);
    } finally {
      await project.cleanup();
    }
  });

  it("reports a missing-placeholder mismatch", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de"] },
      { greeting: "Hello {{name}} new" },
    );
    try {
      await writeTargetFile(project, "de", { greeting: "Hallo" });
      await writeLockFile(project, "de", { greeting: "old-hash-forces-changed" });

      const result = await keyIntegrityHandler({ key: "greeting" }, deps(project));

      expect(result.locales).toEqual([
        {
          locale: "de",
          hasPlaceholders: true,
          matches: false,
          missing: ["{{name}}"],
          extra: [],
          icuValid: true,
          markupMatches: true,
          markupDetails: [],
        },
      ]);
    } finally {
      await project.cleanup();
    }
  });

  it("reports an extra-placeholder mismatch", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "Hello new" });
    try {
      await writeTargetFile(project, "de", { greeting: "Hallo {{name}}" });
      await writeLockFile(project, "de", { greeting: "old-hash-forces-changed" });

      const result = await keyIntegrityHandler({ key: "greeting" }, deps(project));

      expect(result.locales).toEqual([
        {
          locale: "de",
          hasPlaceholders: false,
          matches: false,
          missing: [],
          extra: ["{{name}}"],
          icuValid: true,
          markupMatches: true,
          markupDetails: [],
        },
      ]);
    } finally {
      await project.cleanup();
    }
  });

  it("reports a key with no placeholders at all as hasPlaceholders: false, matches: true", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { plain: "Just text new" });
    try {
      await writeTargetFile(project, "de", { plain: "Nur Text" });
      await writeLockFile(project, "de", { plain: "old-hash-forces-changed" });

      const result = await keyIntegrityHandler({ key: "plain" }, deps(project));

      expect(result.locales).toEqual([
        {
          locale: "de",
          hasPlaceholders: false,
          matches: true,
          missing: [],
          extra: [],
          icuValid: true,
          markupMatches: true,
          markupDetails: [],
        },
      ]);
    } finally {
      await project.cleanup();
    }
  });

  it("reports an ICU-format mismatch through the adapter's branch-aware comparePlaceholders", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de"], format: "arb" },
      { count: "{count, plural, one {# item {name}} other {# items {name}}}" },
    );
    try {
      await writeTargetFile(project, "de", {
        count: "{count, plural, one {# Artikel} other {# Artikel}}",
      });
      await writeLockFile(project, "de", { count: "old-hash-forces-changed" });

      const result = await keyIntegrityHandler({ key: "count" }, deps(project));

      expect(result.locales).toHaveLength(1);
      expect(result.locales[0]?.matches).toBe(false);
      expect(result.locales[0]?.missing).toContain("{name}");
    } finally {
      await project.cleanup();
    }
  });

  it("reports icuValid: false for a target that is malformed ICU message syntax, independent of the placeholder result", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de"], format: "arb" },
      { count: "{count, plural, one {# item} other {# items}}" },
    );
    try {
      await writeTargetFile(project, "de", { count: "{count, plural, one {# Artikel" });
      await writeLockFile(project, "de", { count: "old-hash-forces-changed" });

      const result = await keyIntegrityHandler({ key: "count" }, deps(project));

      expect(result.locales).toHaveLength(1);
      expect(result.locales[0]?.icuValid).toBe(false);
    } finally {
      await project.cleanup();
    }
  });

  it("omits a locale where the requested key is not changed (missing, orphaned, or in sync)", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de"] },
      { greeting: "hello", farewell: "bye" },
    );
    try {
      await writeTargetFile(project, "de", { farewell: "bye" });

      const result = await keyIntegrityHandler({ key: "greeting" }, deps(project));

      expect(result.locales).toEqual([]);
    } finally {
      await project.cleanup();
    }
  });

  it("diffs only the requested locale subset", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de", "fr"] },
      { greeting: "Hello new" },
    );
    try {
      await writeTargetFile(project, "de", { greeting: "Hallo" });
      await writeTargetFile(project, "fr", { greeting: "Bonjour" });
      await writeLockFile(project, "de", { greeting: "old-hash-forces-changed" });

      const result = await keyIntegrityHandler({ key: "greeting", locales: ["de"] }, deps(project));

      expect(result.locales.map((locale) => locale.locale)).toEqual(["de"]);
    } finally {
      await project.cleanup();
    }
  });

  it("reads the target file fresh on every call, never caching it between requests", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "Hello new" });
    try {
      await writeTargetFile(project, "de", { greeting: "Hallo" });
      await writeLockFile(project, "de", { greeting: "old-hash-forces-changed" });

      const first = await keyIntegrityHandler({ key: "greeting" }, deps(project));
      expect(first.locales[0]?.matches).toBe(true);

      await writeTargetFile(project, "de", { greeting: "Hallo {{name}}" });

      const second = await keyIntegrityHandler({ key: "greeting" }, deps(project));
      expect(second.locales[0]?.matches).toBe(false);
    } finally {
      await project.cleanup();
    }
  });

  it("never exposes the full source or target sentence, only the boolean result and placeholder tokens", async () => {
    const longSourceSentence =
      "Welcome {{name}}, this paragraph describes our product in extensive marketing detail that must never leak.";
    const longTargetSentence =
      "Willkommen, dieser lange deutsche Absatz beschreibt unser Produkt ausfuehrlich und darf niemals nach aussen dringen.";
    const project = await makeFixtureProject(
      { targetLocales: ["de"] },
      { greeting: longSourceSentence },
    );
    try {
      await writeTargetFile(project, "de", { greeting: longTargetSentence });
      await writeLockFile(project, "de", { greeting: "old-hash-forces-changed" });

      const result = await keyIntegrityHandler({ key: "greeting" }, deps(project));
      const serialized = JSON.stringify(result);

      expect(serialized).not.toContain(longSourceSentence);
      expect(serialized).not.toContain(longTargetSentence);
      expect(serialized).not.toContain("marketing detail");
      expect(serialized).not.toContain("Absatz");
      expect(serialized).toContain("{{name}}");
    } finally {
      await project.cleanup();
    }
  });
});
