import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  checkRoot,
  findImporterGaps,
  findMismatches,
  manifestSpecifiers,
  parseLockImporters,
} from "./check-catalog-lockfile.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const SCRIPT = join(SCRIPT_DIR, "check-catalog-lockfile.mjs");

const ROOT_MANIFEST = {
  name: "fixture-root",
  private: true,
  devDependencies: {
    "@vitest/coverage-v8": "catalog:",
    turbo: "2.11.7",
    vitest: "catalog:",
  },
};

const CORE_MANIFEST = {
  name: "@fixture/core",
  dependencies: { "@xmldom/xmldom": "catalog:bundled", zod: "catalog:" },
  devDependencies: { "@fixture/config": "workspace:*" },
  optionalDependencies: { fsevents: "catalog:" },
};

const CLEAN_LOCK = `lockfileVersion: '9.0'

catalogs:
  default:
    vitest:
      specifier: 5.0.3
      version: 5.0.3

importers:

  .:
    devDependencies:
      '@vitest/coverage-v8':
        specifier: 'catalog:'
        version: 5.0.3(vitest@5.0.3)
      turbo:
        specifier: 2.11.7
        version: 2.11.7
      vitest:
        specifier: 'catalog:'
        version: 5.0.3(@types/node@26.6.5)

  packages/core:
    dependencies:
      '@xmldom/xmldom':
        specifier: catalog:bundled
        version: 0.9.12
      zod:
        specifier: 'catalog:'
        version: 4.4.3
    devDependencies:
      '@fixture/config':
        specifier: workspace:*
        version: link:../config
    optionalDependencies:
      fsevents:
        specifier: 'catalog:'
        version: 2.3.3

packages:

  vitest@5.0.3:
    resolution: {integrity: sha512-x}
`;

function manifests(overrides = {}) {
  return {
    ".": manifestSpecifiers(JSON.stringify(overrides.root ?? ROOT_MANIFEST)),
    "packages/core": manifestSpecifiers(JSON.stringify(overrides.core ?? CORE_MANIFEST)),
  };
}

function mismatchesFor(lockText, overrides) {
  return findMismatches(parseLockImporters(lockText), manifests(overrides));
}

function corrupt(lockText, from, to) {
  expect(lockText).toContain(from);
  return lockText.replace(from, to);
}

describe("parseLockImporters", () => {
  it("reads every importer's specifiers and ignores the catalogs and packages sections", () => {
    expect(parseLockImporters(CLEAN_LOCK)).toEqual({
      ".": {
        "@vitest/coverage-v8": "catalog:",
        turbo: "2.11.7",
        vitest: "catalog:",
      },
      "packages/core": {
        "@xmldom/xmldom": "catalog:bundled",
        "@fixture/config": "workspace:*",
        fsevents: "catalog:",
        zod: "catalog:",
      },
    });
  });

  it("returns nothing for a lockfile without importers", () => {
    expect(parseLockImporters("lockfileVersion: '9.0'\n")).toEqual({});
  });

  it("reads a CRLF lockfile the same as an LF one", () => {
    expect(parseLockImporters(CLEAN_LOCK.replaceAll("\n", "\r\n"))).toEqual(
      parseLockImporters(CLEAN_LOCK),
    );
  });

  it("reads a lockfile with a byte order mark the same as one without", () => {
    const importersFirst = CLEAN_LOCK.slice(CLEAN_LOCK.indexOf("importers:"));
    expect(parseLockImporters(`\uFEFF${importersFirst}`)).toEqual(parseLockImporters(CLEAN_LOCK));
  });

  it("reads no importers from a lockfile re-indented to four spaces", () => {
    const reindented = CLEAN_LOCK.split("\n")
      .map((line) => line.replace(/^( +)/, (indent) => indent.repeat(2)))
      .join("\n");
    expect(parseLockImporters(reindented)).toEqual({});
  });
});

describe("manifestSpecifiers", () => {
  it("lets dependencies win over devDependencies, as pnpm's lockfile does", () => {
    const manifest = {
      dependencies: { "is-number": "7.0.0" },
      devDependencies: { "is-number": "catalog:" },
    };
    expect(manifestSpecifiers(JSON.stringify(manifest))).toEqual({ "is-number": "7.0.0" });
  });

  it("lets optionalDependencies win over dependencies, as pnpm's lockfile does", () => {
    const manifest = {
      dependencies: { "is-number": "7.0.0" },
      optionalDependencies: { "is-number": "catalog:" },
    };
    expect(manifestSpecifiers(JSON.stringify(manifest))).toEqual({ "is-number": "catalog:" });
  });
});

describe("findImporterGaps", () => {
  it("reports a lockfile importer without a readable package.json", () => {
    const lock = parseLockImporters(CLEAN_LOCK);
    const byImporter = { ...manifests(), "packages/core": null };
    expect(findImporterGaps(lock, byImporter)).toEqual([
      { importer: "packages/core", reason: "has no readable package.json" },
    ]);
  });

  it("reports a catalog-using manifest whose importer has no parsed specifiers", () => {
    const lock = { ...parseLockImporters(CLEAN_LOCK), "packages/core": {} };
    expect(findImporterGaps(lock, manifests())).toEqual([
      {
        importer: "packages/core",
        reason: "declares a catalog: dependency but has no parsed specifiers",
      },
    ]);
  });

  it("ignores an importer with no parsed specifiers when its manifest uses no catalog", () => {
    const lock = { ...parseLockImporters(CLEAN_LOCK), "apps/docs": {} };
    const byImporter = { ...manifests(), "apps/docs": { next: "16.2.11" } };
    expect(findImporterGaps(lock, byImporter)).toEqual([]);
  });
});

describe("findMismatches", () => {
  it("passes a lockfile whose catalog specifiers match every manifest", () => {
    expect(mismatchesFor(CLEAN_LOCK)).toEqual([]);
  });

  it("flags a root importer catalog specifier rewritten to a literal version", () => {
    const lock = corrupt(
      CLEAN_LOCK,
      "      vitest:\n        specifier: 'catalog:'",
      "      vitest:\n        specifier: 5.0.3",
    );
    expect(mismatchesFor(lock)).toEqual([
      { importer: ".", dependency: "vitest", manifest: "catalog:", lock: "5.0.3" },
    ]);
  });

  it("flags only the corrupted one of two packages bumped together", () => {
    const lock = corrupt(
      CLEAN_LOCK,
      "      vitest:\n        specifier: 'catalog:'",
      "      vitest:\n        specifier: 5.0.3",
    );
    const flagged = mismatchesFor(lock).map((mismatch) => mismatch.dependency);
    expect(flagged).toEqual(["vitest"]);
    expect(flagged).not.toContain("@vitest/coverage-v8");
  });

  it("flags a package importer catalog specifier rewritten to a literal version", () => {
    const lock = corrupt(
      CLEAN_LOCK,
      "      zod:\n        specifier: 'catalog:'",
      "      zod:\n        specifier: 4.4.3",
    );
    expect(mismatchesFor(lock)).toEqual([
      { importer: "packages/core", dependency: "zod", manifest: "catalog:", lock: "4.4.3" },
    ]);
  });

  it("flags a named catalog specifier rewritten to a literal version", () => {
    const lock = corrupt(CLEAN_LOCK, "specifier: catalog:bundled", "specifier: 0.9.12");
    expect(mismatchesFor(lock)).toEqual([
      {
        importer: "packages/core",
        dependency: "@xmldom/xmldom",
        manifest: "catalog:bundled",
        lock: "0.9.12",
      },
    ]);
  });

  it("reads a quoted scoped name and flags its corrupted specifier", () => {
    const lock = corrupt(
      CLEAN_LOCK,
      "      '@vitest/coverage-v8':\n        specifier: 'catalog:'",
      "      '@vitest/coverage-v8':\n        specifier: 5.0.3",
    );
    expect(mismatchesFor(lock)).toEqual([
      { importer: ".", dependency: "@vitest/coverage-v8", manifest: "catalog:", lock: "5.0.3" },
    ]);
  });

  it("checks optionalDependencies too", () => {
    const lock = corrupt(
      CLEAN_LOCK,
      "      fsevents:\n        specifier: 'catalog:'",
      "      fsevents:\n        specifier: 2.3.3",
    );
    expect(mismatchesFor(lock).map((mismatch) => mismatch.dependency)).toEqual(["fsevents"]);
  });

  it("ignores a disagreement between two non-catalog specifiers", () => {
    const lock = corrupt(CLEAN_LOCK, "specifier: 2.11.7", "specifier: 2.11.8");
    const workspaceLock = corrupt(lock, "specifier: workspace:*", "specifier: workspace:^");
    expect(mismatchesFor(workspaceLock)).toEqual([]);
  });

  it("flags the reverse case: the lockfile says catalog but the manifest holds a literal", () => {
    const root = {
      ...ROOT_MANIFEST,
      devDependencies: { ...ROOT_MANIFEST.devDependencies, vitest: "5.0.3" },
    };
    expect(mismatchesFor(CLEAN_LOCK, { root })).toEqual([
      { importer: ".", dependency: "vitest", manifest: "5.0.3", lock: "catalog:" },
    ]);
  });

  it("treats catalog:default and catalog: as different strings, as a frozen pnpm install does", () => {
    const root = {
      ...ROOT_MANIFEST,
      devDependencies: { ...ROOT_MANIFEST.devDependencies, vitest: "catalog:default" },
    };
    expect(mismatchesFor(CLEAN_LOCK, { root })).toEqual([
      { importer: ".", dependency: "vitest", manifest: "catalog:default", lock: "catalog:" },
    ]);
  });

  it("flags a catalog dependency present on only one side", () => {
    const core = {
      ...CORE_MANIFEST,
      dependencies: { ...CORE_MANIFEST.dependencies, yaml: "catalog:bundled" },
    };
    expect(mismatchesFor(CLEAN_LOCK, { core })).toEqual([
      {
        importer: "packages/core",
        dependency: "yaml",
        manifest: "catalog:bundled",
        lock: "(absent)",
      },
    ]);
  });
});

describe("check-catalog-lockfile on disk", () => {
  const roots = [];

  afterAll(() => {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function fixtureRoot(lockText) {
    const root = mkdtempSync(join(tmpdir(), "check-catalog-lockfile-"));
    roots.push(root);
    mkdirSync(join(root, "packages/core"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify(ROOT_MANIFEST));
    writeFileSync(join(root, "packages/core/package.json"), JSON.stringify(CORE_MANIFEST));
    writeFileSync(join(root, "pnpm-lock.yaml"), lockText);
    return root;
  }

  function run(root) {
    try {
      const stdout = execFileSync(process.execPath, [SCRIPT, root], {
        encoding: "utf8",
        stdio: "pipe",
      });
      return { status: 0, stdout, stderr: "" };
    } catch (error) {
      return { status: error.status, stdout: error.stdout, stderr: error.stderr };
    }
  }

  it("exits 0 on a clean fixture", () => {
    const result = run(fixtureRoot(CLEAN_LOCK));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("2 importer(s)");
  });

  it("exits 1 with one line per mismatch and a fix hint", () => {
    const lock = corrupt(
      CLEAN_LOCK,
      "      vitest:\n        specifier: 'catalog:'",
      "      vitest:\n        specifier: 5.0.3",
    );
    const result = run(fixtureRoot(lock));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("  . > vitest: manifest catalog:, lockfile 5.0.3");
    expect(result.stderr).toContain("run `pnpm install` locally and commit pnpm-lock.yaml");
  });

  it("exits 1 when there is no lockfile", () => {
    const root = mkdtempSync(join(tmpdir(), "check-catalog-lockfile-"));
    roots.push(root);
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no pnpm-lock.yaml");
  });

  it("exits 1 when the lockfile has no importers section", () => {
    const lock = CLEAN_LOCK.slice(0, CLEAN_LOCK.indexOf("importers:"));
    const result = run(fixtureRoot(lock));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("parsed no importers from pnpm-lock.yaml");
  });

  it("exits 1 when the lockfile is re-indented to four spaces", () => {
    const lock = CLEAN_LOCK.split("\n")
      .map((line) => line.replace(/^( +)/, (indent) => indent.repeat(2)))
      .join("\n");
    const result = run(fixtureRoot(lock));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("parsed no importers from pnpm-lock.yaml");
  });

  it("exits 1 when a catalog-using importer's specifiers do not parse", () => {
    const reindented = CLEAN_LOCK.replace(
      /( {2}packages\/core:\n)([\s\S]*?)(\n\npackages:)/,
      (_, head, body, tail) => head + body.replace(/^ {4}/gm, "     ") + tail,
    );
    expect(reindented).not.toEqual(CLEAN_LOCK);
    const result = run(fixtureRoot(reindented));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "  packages/core: declares a catalog: dependency but has no parsed specifiers",
    );
  });

  it("exits 1 when a lockfile importer has no package.json", () => {
    const root = fixtureRoot(CLEAN_LOCK);
    rmSync(join(root, "packages/core/package.json"));
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("  packages/core: has no readable package.json");
  });

  it("does not read pnpm-workspace.yaml", () => {
    const root = fixtureRoot(CLEAN_LOCK);
    writeFileSync(join(root, "pnpm-workspace.yaml"), 'packages: &a !tag ["x\\ty"]\n');
    expect(run(root).status).toBe(0);
  });

  it("passes the repository's own lockfile", () => {
    const { importers, gaps, mismatches } = checkRoot(REPO_ROOT);
    expect(importers).toBeGreaterThan(1);
    expect(gaps).toEqual([]);
    expect(mismatches).toEqual([]);
  });
});
