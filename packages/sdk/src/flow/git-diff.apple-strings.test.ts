import { mkdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { baseConfig, type GitFixture, makeGitFixture } from "../test-support.js";
import { localeGitDiff } from "./git-diff.js";
import { LOCALE_GIT_BLOB_MAX_BYTES } from "./git-revision.js";
import { localeGitStatus } from "./git-status.js";

const fixtures: GitFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((created) => created.cleanup()));
});

const CONFIG = baseConfig({
  format: "apple-strings",
  files: { pattern: "locales/{locale}.lproj/Localizable.strings" },
});

const STRINGS = "locales/de.lproj/Localizable.strings";
const DICT = "locales/de.lproj/Localizable.stringsdict";

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

function strings(greeting: string): string {
  return `"greeting" = "${greeting}";\n`;
}

async function committed(): Promise<GitFixture> {
  const fx = await makeGitFixture();
  fixtures.push(fx);
  await fx.write("locales/en.lproj/Localizable.strings", strings("Hello"));
  await fx.write(STRINGS, strings("Hallo"));
  await fx.write(DICT, stringsdict("%d Fotos"));
  await fx.commitAll();
  return fx;
}

async function diffOf(fx: GitFixture) {
  return localeGitDiff({ config: CONFIG, locale: "de", cwd: fx.root });
}

describe("localeGitDiff for apple-strings and its .stringsdict sibling", () => {
  it("lists the plural key as unchanged when only the .strings file changed", async () => {
    const fx = await committed();
    await fx.write(STRINGS, strings("Servus"));

    expect(await diffOf(fx)).toMatchObject({
      state: "modified",
      added: [],
      removed: [],
      changed: [{ key: "greeting", before: "Hallo", after: "Servus" }],
    });
  });

  it("lists the plural arm changed in the .stringsdict file alone", async () => {
    const fx = await committed();
    await fx.write(DICT, stringsdict("%d Bilder"));

    const diff = await diffOf(fx);

    expect(diff).toMatchObject({ state: "modified", added: [], removed: [] });
    expect(diff.available && diff.changed.map((change) => change.key)).toEqual([
      "photo_count_other",
    ]);
  });

  it("lists the plural key as added when the sibling is new", async () => {
    const fx = await committed();
    await fx.git(["rm", "-q", "--cached", DICT]);
    await fx.git(["commit", "-q", "-m", "without dict"]);
    await fx.write(DICT, stringsdict("%d Fotos"));

    const diff = await diffOf(fx);

    expect(diff).toMatchObject({ state: "untracked", removed: [], changed: [] });
    expect(diff.available && diff.added.map((entry) => entry.key)).toEqual([
      "photo_count_one",
      "photo_count_other",
    ]);
  });

  it("lists the plural key as removed when the sibling is deleted alone", async () => {
    const fx = await committed();
    await rm(join(fx.root, DICT));

    const diff = await diffOf(fx);

    expect(diff).toMatchObject({ state: "deleted", added: [], changed: [] });
    expect(diff.available && diff.removed.map((entry) => entry.key)).toEqual([
      "photo_count_one",
      "photo_count_other",
    ]);
  });

  it("lists nothing when neither file changed", async () => {
    const fx = await committed();

    expect(await diffOf(fx)).toMatchObject({ state: "unchanged", added: [], removed: [] });
  });

  it("refuses a committed sibling above the size bound", async () => {
    const fx = await committed();
    await fx.write(DICT, "x".repeat(LOCALE_GIT_BLOB_MAX_BYTES + 1));
    await fx.commitAll("big");
    await fx.write(DICT, stringsdict("%d Fotos"));

    expect(await diffOf(fx)).toEqual({ available: false, reason: "output-too-large" });
  });

  it("refuses a committed sibling that does not parse", async () => {
    const fx = await committed();
    await fx.write(DICT, "<plist><dict>");
    await fx.commitAll("broken");
    await fx.write(DICT, stringsdict("%d Fotos"));

    expect(await diffOf(fx)).toEqual({ available: false, reason: "revision-unreadable" });
  });

  it("refuses a committed sibling that is a symbolic link", async () => {
    const fx = await committed();
    await rm(join(fx.root, DICT));
    await fx.write("elsewhere.stringsdict", stringsdict("%d Fotos"));
    await symlink("../../../elsewhere.stringsdict", join(fx.root, DICT));
    await fx.commitAll("link");
    await rm(join(fx.root, DICT));
    await fx.write(DICT, stringsdict("%d Bilder"));

    expect(await diffOf(fx)).toEqual({ available: false, reason: "revision-unreadable" });
  });

  it("refuses a sibling on disk that is a symbolic link", async () => {
    const fx = await committed();
    await rm(join(fx.root, DICT));
    await fx.write("elsewhere.stringsdict", stringsdict("%d Bilder"));
    await symlink("../../../elsewhere.stringsdict", join(fx.root, DICT));

    expect(await diffOf(fx)).toEqual({ available: false, reason: "working-file-unreadable" });
  });
});

describe("localeGitStatus for apple-strings", () => {
  it("lists the .stringsdict file with the locales of its .strings file", async () => {
    const fx = await committed();
    await fx.write(DICT, stringsdict("%d Bilder"));
    await mkdir(join(fx.root, "locales", "fr.lproj"), { recursive: true });

    const status = await localeGitStatus({ config: CONFIG, cwd: fx.root });

    expect(status).toMatchObject({
      available: true,
      files: [{ path: DICT, locales: ["de"], state: "modified" }],
    });
  });
});
