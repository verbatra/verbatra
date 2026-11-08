import { join } from "node:path";
import { contentHash } from "@verbatra/core";
import { afterEach, describe, expect, it } from "vitest";
import { valueHash } from "../lock/provenance-file.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { baseConfig, type GitFixture, makeGitFixture } from "../test-support.js";
import { type KeyHistoryResult, keyHistory } from "./key-history.js";

const fixtures: GitFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((created) => created.cleanup()));
});

async function repo(): Promise<GitFixture> {
  const fx = await makeGitFixture();
  fixtures.push(fx);
  return fx;
}

function available(result: KeyHistoryResult): Extract<KeyHistoryResult, { available: true }> {
  if (!result.available) {
    throw new Error(`unavailable: ${result.reason}`);
  }
  expect(result.truncated).toBe(result.truncatedBy.length > 0);
  return result;
}

const APPLE = baseConfig({
  format: "apple-strings",
  files: { pattern: "locales/{locale}.lproj/Localizable.strings" },
});

const HEADER =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n';

function stringsdict(other: string): string {
  return (
    `${HEADER}<plist version="1.0"><dict><key>photo_count</key><dict>` +
    "<key>NSStringLocalizedFormatKey</key><string>%#@photos@</string>" +
    "<key>photos</key><dict>" +
    "<key>NSStringFormatSpecTypeKey</key><string>NSStringPluralRuleType</string>" +
    "<key>NSStringFormatValueTypeKey</key><string>d</string>" +
    `<key>one</key><string>%d Foto</string><key>other</key><string>${other}</string>` +
    "</dict></dict></dict></plist>\n"
  );
}

describe("keyHistory for apple-strings and its .stringsdict sibling", () => {
  it("follows a plural arm that lives in the .stringsdict file", async () => {
    const fx = await repo();
    await fx.write("locales/de.lproj/Localizable.strings", '"greeting" = "Hallo";\n');
    await fx.write("locales/de.lproj/Localizable.stringsdict", stringsdict("%d Fotos"));
    await fx.commitAll("first");
    await fx.write("locales/de.lproj/Localizable.stringsdict", stringsdict("%d Bilder"));
    await fx.commitAll("dict only");
    await fx.write("locales/de.lproj/Localizable.strings", '"greeting" = "Servus";\n');
    await fx.commitAll("strings only");

    const arm = available(
      await keyHistory({ config: APPLE, cwd: fx.root, locale: "de", key: "photo_count_other" }),
    );
    const greeting = available(
      await keyHistory({ config: APPLE, cwd: fx.root, locale: "de", key: "greeting" }),
    );

    expect(arm.revisions.map((revision) => [revision.subject, revision.value])).toEqual([
      ["dict only", "%d Bilder"],
      ["first", "%d Fotos"],
    ]);
    expect(greeting.revisions.map((revision) => revision.value)).toEqual(["Servus", "Hallo"]);
  });

  it("reads a key that exists only in the .stringsdict file when the .strings file is absent at a commit", async () => {
    const fx = await repo();
    await fx.write("locales/de.lproj/Localizable.stringsdict", stringsdict("%d Fotos"));
    await fx.commitAll("dict only");

    const arm = available(
      await keyHistory({ config: APPLE, cwd: fx.root, locale: "de", key: "photo_count_other" }),
    );

    expect(arm.revisions.map((revision) => revision.value)).toEqual(["%d Fotos"]);
  });

  it("returns the uncommitted .stringsdict edit as the working tree", async () => {
    const fx = await repo();
    await fx.write("locales/de.lproj/Localizable.strings", '"greeting" = "Hallo";\n');
    await fx.write("locales/de.lproj/Localizable.stringsdict", stringsdict("%d Fotos"));
    await fx.commitAll("first");
    await fx.write("locales/de.lproj/Localizable.stringsdict", stringsdict("%d Bilder"));

    const arm = available(
      await keyHistory({ config: APPLE, cwd: fx.root, locale: "de", key: "photo_count_other" }),
    );

    expect(arm.workingTree?.value).toBe("%d Bilder");
  });
});

describe("keyHistory for apple-xcstrings", () => {
  const XC = baseConfig({
    format: "apple-xcstrings",
    files: { pattern: "{locale}Localizable.xcstrings" },
  });

  function catalogue(de: string, fr: string): string {
    return `${JSON.stringify({
      sourceLanguage: "en",
      version: "1.0",
      strings: {
        hi: {
          localizations: {
            en: { stringUnit: { state: "translated", value: "Hi" } },
            de: { stringUnit: { state: "translated", value: de } },
            fr: { stringUnit: { state: "translated", value: fr } },
          },
        },
      },
    })}\n`;
  }

  it("lists a commit only for the locale whose value changed", async () => {
    const fx = await repo();
    const config = { ...XC, targetLocales: ["de", "fr"] };
    await fx.write("Localizable.xcstrings", catalogue("Hallo", "Salut"));
    await fx.commitAll("first");
    await fx.write("Localizable.xcstrings", catalogue("Servus", "Salut"));
    await fx.commitAll("german only");
    await fx.write("Localizable.xcstrings", catalogue("Servus", "Coucou"));
    await fx.commitAll("french only");

    const german = available(await keyHistory({ config, cwd: fx.root, locale: "de", key: "hi" }));
    const french = available(await keyHistory({ config, cwd: fx.root, locale: "fr", key: "hi" }));

    expect(german.revisions.map((revision) => revision.subject)).toEqual(["german only", "first"]);
    expect(french.revisions.map((revision) => revision.subject)).toEqual(["french only", "first"]);
  });
});

describe("keyHistory in a monorepo subdirectory", () => {
  it("reads the lock-file and provenance next to the project, not the repository root's", async () => {
    const fx = await repo();
    const app = join(fx.root, "packages", "app");
    const config = baseConfig();
    await fx.write("locales/en.json", `${JSON.stringify({ a: "Hello" })}\n`, app);
    await fx.write("locales/de.json", `${JSON.stringify({ a: "Hallo" })}\n`, app);
    const source = await selectAdapter("i18next-json").read(join(app, "locales/en.json"), "en");
    const hash = contentHash(source.resource.entries.get("a") as never);
    await fx.write(
      "verbatra.lock.json",
      `${JSON.stringify({ version: 1, locales: { de: { a: hash } } })}\n`,
      app,
    );
    await fx.write(
      "verbatra.provenance.json",
      `${JSON.stringify({ version: 1, locales: { de: { a: { origin: "human", valueHash: valueHash("Hallo") } } } })}\n`,
      app,
    );
    await fx.write(
      "verbatra.provenance.json",
      `${JSON.stringify({ version: 1, locales: { de: { a: { origin: "machine", valueHash: valueHash("Hallo") } } } })}\n`,
    );
    await fx.commitAll("one");

    const result = available(await keyHistory({ config, cwd: app, locale: "de", key: "a" }));

    expect(result.revisions[0]).toMatchObject({
      value: "Hallo",
      origin: "human",
      sourceChanged: false,
    });
  });
});
