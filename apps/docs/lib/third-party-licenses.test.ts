import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import committed from "./licenses.generated.json";
import {
  buildThirdPartyLicenses,
  renderThirdPartyNotices,
  type ThirdPartyLicenses,
} from "./third-party-licenses";

const APP_DIR = process.cwd();
const NOTICES_PATH = join(APP_DIR, "../../THIRD_PARTY_NOTICES.md");
const RESYNC = "stale: run `pnpm --filter @verbatra/docs licenses:sync` and commit the result";

const fresh = buildThirdPartyLicenses(APP_DIR);
const manifest: ThirdPartyLicenses = committed;
const docsManifest = JSON.parse(readFileSync(join(APP_DIR, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
};

function packageNames(data: ThirdPartyLicenses): string[] {
  return data.groups.flatMap((group) => group.packages.map((pkg) => pkg.name));
}

describe("third-party licenses", () => {
  it("keeps lib/licenses.generated.json in step with the installed production dependencies", () => {
    expect(manifest, RESYNC).toEqual(fresh);
  });

  it("keeps THIRD_PARTY_NOTICES.md in step with the same data", () => {
    expect(readFileSync(NOTICES_PATH, "utf8"), RESYNC).toBe(renderThirdPartyNotices(fresh));
  });

  it("covers every direct production dependency and no development-only one", () => {
    const names = new Set(packageNames(manifest));
    for (const name of Object.keys(docsManifest.dependencies))
      expect(names.has(name), name).toBe(true);
    for (const name of ["vitest", "jsdom", "playwright", "@verbatra/sdk"]) {
      expect(names.has(name), name).toBe(false);
    }
    const entries = manifest.groups.flatMap((group) =>
      group.packages.map((pkg) => `${pkg.name}@${pkg.version}`),
    );
    expect(new Set(entries).size).toBe(entries.length);
    expect(manifest.packageCount).toBe(entries.length);
  });

  it("lists no simple-icons package, since the site draws no third-party logo", () => {
    expect(packageNames(manifest).some((name) => name.includes("simple-icons"))).toBe(false);
  });

  it("gives every package a license text, its own or the one its license group falls back to", () => {
    const ids = new Set(manifest.texts.map((text) => text.id));
    for (const group of manifest.groups) {
      for (const pkg of group.packages) {
        const texts = pkg.textId === null ? group.fallbackTextIds : [pkg.textId];
        expect(texts.length, `${pkg.name} (${group.license})`).toBeGreaterThan(0);
        for (const id of texts) expect(ids.has(id), id).toBe(true);
      }
    }
  });

  it("ships a full Apache-2.0 text, which that license requires to travel with the code", () => {
    const apache = manifest.texts.filter((text) => text.license === "Apache-2.0");
    expect(apache.some((text) => text.text.includes("TERMS AND CONDITIONS FOR USE"))).toBe(true);
  });

  it("names the Geist fonts under OFL-1.1 with Vercel's copyright and the full license", () => {
    const geist = manifest.assets.find((asset) => asset.name.startsWith("Geist"));
    expect(geist?.license).toBe("OFL-1.1");
    expect(geist?.copyright).toContain(
      "Copyright (c) 2023 Vercel, in collaboration with basement.studio",
    );
    const text = manifest.texts.find((entry) => entry.id === geist?.textId);
    expect(text?.text).toContain("SIL OPEN FONT LICENSE Version 1.1");
  });

  it("splits only real copyright lines out of a license text, never a sentence of its body", () => {
    for (const group of manifest.groups) {
      for (const pkg of group.packages) {
        for (const line of pkg.copyright) expect(line, pkg.name).not.toMatch(/HOLDERS? BE LIABLE/i);
      }
    }
    const mit = manifest.texts.filter((text) => text.license === "MIT");
    for (const text of mit) expect(text.text, text.id).toMatch(/COPYRIGHT HOLDERS BE LIABLE/i);
  });
});
