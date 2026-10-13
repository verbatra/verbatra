import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import committed from "./licenses.generated.json";
import committedPlatform from "./platform-licenses.json";
import {
  buildThirdPartyLicenses,
  compareVersions,
  DEPLOY_TARGET,
  listDeployedPlatformPackages,
  matchesTarget,
  parseLockfile,
  RESYNC_COMMAND,
  readMatching,
  renderThirdPartyNotices,
  type ThirdPartyLicenses,
} from "./third-party-licenses";

const APP_DIR = process.cwd();
const NOTICES_PATH = join(APP_DIR, "../../THIRD_PARTY_NOTICES.md");
const RESYNC = `stale: run \`${RESYNC_COMMAND}\` and commit the result`;

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

  it("names the exact resync command in its staleness message", () => {
    expect(RESYNC_COMMAND).toBe("pnpm --filter @verbatra/docs licenses:sync");
  });

  it("keeps lib/platform-licenses.json listing exactly the packages of the deployed platform", () => {
    expect(Object.keys(committedPlatform).sort(), RESYNC).toEqual(
      listDeployedPlatformPackages(APP_DIR),
    );
  });

  it("targets the glibc linux-x64 platform of the Debian image in the Dockerfile", () => {
    const dockerfile = readFileSync(join(APP_DIR, "Dockerfile"), "utf8");
    const bases = [...dockerfile.matchAll(/^FROM\s+(\S+)/gm)].map((match) => match[1] ?? "");
    expect(bases.length).toBeGreaterThan(0);
    for (const base of bases) {
      expect(base).toMatch(/^node:[\d.]+-(?:bookworm|trixie|bullseye)/);
      expect(base).not.toMatch(/alpine/);
    }
    expect(DEPLOY_TARGET).toEqual({ os: ["linux"], cpu: ["x64"], libc: ["glibc"] });
  });

  it("lists the libvips binary the image ships under LGPL-3.0-or-later with the full LGPL text", () => {
    const group = manifest.groups.find((entry) => entry.license === "LGPL-3.0-or-later");
    const libvips = group?.packages.find((pkg) => pkg.name === "@img/sharp-libvips-linux-x64");
    expect(libvips).toBeDefined();
    const ids = libvips?.textId === null ? (group?.fallbackTextIds ?? []) : [libvips?.textId];
    const texts = manifest.texts.filter((text) => ids.includes(text.id)).map((text) => text.text);
    expect(texts.some((text) => text.includes("GNU LESSER GENERAL PUBLIC LICENSE"))).toBe(true);
    expect(texts.some((text) => text.includes("GNU GENERAL PUBLIC LICENSE"))).toBe(true);
  });

  it("lists the same platform binaries on every host: only linux-x64 glibc ones", () => {
    const names = packageNames(manifest);
    expect(names).toContain("@img/sharp-linux-x64");
    expect(names).toContain("@next/swc-linux-x64-gnu");
    expect(names).toContain("lightningcss-linux-x64-gnu");
    for (const name of names) {
      expect(name).not.toMatch(/darwin|win32|freebsd|musl|wasm32|android|-arm64|linux-arm/);
    }
  });

  it("reads optional and peer dependencies that are installed", () => {
    const names = packageNames(manifest);
    expect(names).toContain("sharp");
    expect(names).toContain("typescript");
  });

  it("matches lockfile platform constraints against the deploy target, negations included", () => {
    expect(matchesTarget({ os: ["linux"], cpu: ["x64"], libc: ["glibc"] })).toBe(true);
    expect(matchesTarget({ os: ["linux"], cpu: ["x64"], libc: ["musl"] })).toBe(false);
    expect(matchesTarget({ os: ["darwin"], cpu: ["arm64"], libc: [] })).toBe(false);
    expect(matchesTarget({ os: ["!win32"], cpu: [], libc: [] })).toBe(true);
    expect(matchesTarget({ os: ["!linux"], cpu: [], libc: [] })).toBe(false);
    expect(matchesTarget({ os: [], cpu: ["wasm32"], libc: [] })).toBe(false);
  });

  it("parses platform constraints and resolved dependencies out of pnpm-lock.yaml", () => {
    const lock = parseLockfile(
      [
        "lockfileVersion: '9.0'",
        "packages:",
        "  '@img/sharp-linux-x64@0.35.5':",
        "    resolution: {integrity: sha512-x}",
        "    cpu: [x64]",
        "    os: [linux]",
        "    libc: [glibc]",
        "  sharp@0.35.5:",
        "    resolution: {integrity: sha512-y}",
        "snapshots:",
        "  sharp@0.35.5(@types/node@26.6.4):",
        "    dependencies:",
        "      detect-libc: 2.1.2",
        "    optionalDependencies:",
        "      '@img/sharp-linux-x64': 0.35.5",
        "    transitivePeerDependencies:",
        "      - '@types/node'",
        "  detect-libc@2.1.2: {}",
      ].join("\n"),
    );
    expect(lock.platforms.get("@img/sharp-linux-x64@0.35.5")).toEqual(DEPLOY_TARGET);
    expect(lock.platforms.has("sharp@0.35.5")).toBe(false);
    expect([...(lock.snapshots.get("sharp@0.35.5") ?? [])]).toEqual([
      ["detect-libc", "2.1.2"],
      ["@img/sharp-linux-x64", "0.35.5"],
    ]);
  });

  it("orders versions of one package semantically, not as strings", () => {
    const versions = ["10.0.0", "2.10.0", "2.9.1", "2.10.0-rc.1", "1.0.0"];
    expect([...versions].sort(compareVersions)).toEqual([
      "1.0.0",
      "2.9.1",
      "2.10.0-rc.1",
      "2.10.0",
      "10.0.0",
    ]);
    for (const group of manifest.groups) {
      for (let index = 1; index < group.packages.length; index++) {
        const previous = group.packages[index - 1];
        const current = group.packages[index];
        if (previous === undefined || current === undefined) continue;
        if (previous.name !== current.name) continue;
        expect(compareVersions(previous.version, current.version), current.name).toBe(-1);
      }
    }
  });

  it("follows a symlinked license file and skips a dangling one", () => {
    const dir = mkdtempSync(join(tmpdir(), "licenses-"));
    try {
      writeFileSync(join(dir, "real.txt"), "Linked license\r\n");
      symlinkSync(join(dir, "real.txt"), join(dir, "LICENSE"));
      symlinkSync(join(dir, "missing.txt"), join(dir, "LICENSE-DANGLING"));
      expect(readMatching(dir, /^licen[cs]e(?:[-._].*)?$/i)).toBe("Linked license");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
