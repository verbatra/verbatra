import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  diffResolvedDependencies,
  evaluate,
  isReleaseBranch,
  namesPublishedPackage,
  parseChangesetPackages,
  parseWorkspaceCatalogs,
  publishedNames,
  resolvePublishedDependencies,
  stripInlineComment,
} from "./check-dependency-changeset.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const SCRIPT_NAME = "check-dependency-changeset.mjs";

const WORKSPACE_YAML = `packages:
  - "packages/*"
  - "apps/*"

# A comment between the packages list and the catalogs.
catalog:
  "@types/node": 26.1.2
  typescript: 6.0.3
  zod: 4.4.3

catalogs:
  bundled:
    "@anthropic-ai/sdk": 0.115.0
    # A comment inside the block must not end it.
    openai: 7.3.0

overrides:
  postcss@<8.5.18: ">=8.5.18 <9"
`;

const SDK_MANIFEST = JSON.stringify({
  name: "@verbatra/sdk",
  dependencies: {
    "@anthropic-ai/sdk": "catalog:bundled",
    cosmiconfig: "9.0.2",
    openai: "catalog:bundled",
    zod: "catalog:",
  },
});

const CLI_MANIFEST = JSON.stringify({
  name: "@verbatra/cli",
  dependencies: { "@verbatra/sdk": "workspace:*", commander: "15.0.0" },
});

const PRIVATE_MANIFEST = JSON.stringify({
  name: "@verbatra/core",
  private: true,
  dependencies: { zod: "catalog:", "some-internal-dep": "1.0.0" },
});

function manifests() {
  return [
    { path: "packages/sdk/package.json", json: SDK_MANIFEST },
    { path: "packages/cli/package.json", json: CLI_MANIFEST },
  ];
}

describe("stripInlineComment", () => {
  it("drops an annotation from a pinned version", () => {
    expect(stripInlineComment("7.3.0 # major taken deliberately")).toBe("7.3.0");
  });

  it("leaves a value with no comment untouched, trimming only", () => {
    expect(stripInlineComment("  7.3.0  ")).toBe("7.3.0");
  });

  it("keeps a hash that is inside quotes, where it is content", () => {
    expect(stripInlineComment('">=1.0.0 <2"')).toBe('">=1.0.0 <2"');
  });

  it("does not cut a hash that is part of the value itself", () => {
    expect(stripInlineComment("1.0.0-rc#1")).toBe("1.0.0-rc#1");
  });
});

describe("parseWorkspaceCatalogs", () => {
  it("parses the default catalog and every named catalog", () => {
    const catalogs = parseWorkspaceCatalogs(WORKSPACE_YAML);

    expect(Object.keys(catalogs).sort()).toEqual(["bundled", "default"]);
    expect(catalogs.default).toEqual({
      "@types/node": "26.1.2",
      typescript: "6.0.3",
      zod: "4.4.3",
    });
    expect(catalogs.bundled).toEqual({ "@anthropic-ai/sdk": "0.115.0", openai: "7.3.0" });
  });

  it("does not let a comment inside a block end it", () => {
    expect(parseWorkspaceCatalogs(WORKSPACE_YAML).bundled?.openai).toBe("7.3.0");
  });

  it("keeps an annotated pin's version clean of its comment", () => {
    const annotated = WORKSPACE_YAML.replace(
      "openai: 7.3.0",
      "openai: 7.3.0 # major taken deliberately, see the changeset",
    );

    expect(parseWorkspaceCatalogs(annotated).bundled?.openai).toBe("7.3.0");
  });

  it("survives a comment on the catalog's own key line", () => {
    const annotated = WORKSPACE_YAML.replace(
      "  bundled:",
      "  bundled: # what @verbatra/sdk re-declares",
    );

    const catalogs = parseWorkspaceCatalogs(annotated);

    expect(Object.keys(catalogs).sort()).toEqual(["bundled", "default"]);
    expect(catalogs.bundled?.openai).toBe("7.3.0");
  });

  it("stops a catalog at the next top-level key", () => {
    expect(parseWorkspaceCatalogs(WORKSPACE_YAML).bundled).not.toHaveProperty("postcss@<8.5.18");
  });

  it("resolves a quoted catalog version the same as an unquoted one", () => {
    const quoted = WORKSPACE_YAML.replace("zod: 4.4.3", 'zod: "4.4.3"');

    expect(parseWorkspaceCatalogs(quoted).default?.zod).toBe("4.4.3");
  });

  it("treats an empty catalog block as an empty catalog, not absent", () => {
    const withEmptyCatalog = `catalog:

catalogs:
  bundled:
    openai: 7.3.0
`;

    expect(parseWorkspaceCatalogs(withEmptyCatalog).default).toEqual({});
  });

  it("has no default catalog when the workspace file omits the catalog block entirely", () => {
    const withoutCatalog = `catalogs:
  bundled:
    openai: 7.3.0
`;

    const catalogs = parseWorkspaceCatalogs(withoutCatalog);

    expect(catalogs.default).toBeUndefined();
    expect(catalogs.bundled).toEqual({ openai: "7.3.0" });
  });

  it("parses the repository's real pnpm-workspace.yaml", () => {
    const real = readFileSync(resolve(REPO_ROOT, "pnpm-workspace.yaml"), "utf8");

    const catalogs = parseWorkspaceCatalogs(real);

    expect(Object.keys(catalogs).sort()).toEqual(["bundled", "default"]);
    expect(catalogs.bundled?.openai).toMatch(/^\d+\.\d+\.\d+$/);
    expect(catalogs.default?.zod).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("publishedNames", () => {
  it("names every manifest not marked private", () => {
    expect(publishedNames(manifests()).sort()).toEqual(["@verbatra/cli", "@verbatra/sdk"]);
  });

  it("excludes a private package", () => {
    const withPrivate = [
      ...manifests(),
      { path: "packages/core/package.json", json: PRIVATE_MANIFEST },
    ];

    expect(publishedNames(withPrivate)).not.toContain("@verbatra/core");
  });
});

describe("resolvePublishedDependencies", () => {
  it("resolves catalog, bundled-catalog and literal specifiers to installable versions", () => {
    const resolved = resolvePublishedDependencies(WORKSPACE_YAML, manifests());

    expect(resolved["@verbatra/sdk > openai"]).toBe("7.3.0");
    expect(resolved["@verbatra/sdk > @anthropic-ai/sdk"]).toBe("0.115.0");
    expect(resolved["@verbatra/sdk > zod"]).toBe("4.4.3");
    expect(resolved["@verbatra/sdk > cosmiconfig"]).toBe("9.0.2");
    expect(resolved["@verbatra/cli > commander"]).toBe("15.0.0");
  });

  it("skips workspace dependencies, whose versions the release flow sets and discloses", () => {
    expect(resolvePublishedDependencies(WORKSPACE_YAML, manifests())).not.toHaveProperty(
      "@verbatra/cli > @verbatra/sdk",
    );
  });

  it("ignores a private package's dependencies entirely", () => {
    const withPrivate = [
      ...manifests(),
      { path: "packages/core/package.json", json: PRIVATE_MANIFEST },
    ];

    const resolved = resolvePublishedDependencies(WORKSPACE_YAML, withPrivate);

    expect(resolved).not.toHaveProperty("@verbatra/core > some-internal-dep");
  });

  it("omits catalog entries no published package depends on, so a toolchain bump is invisible", () => {
    const resolved = resolvePublishedDependencies(WORKSPACE_YAML, manifests());

    expect(Object.keys(resolved).some((key) => key.endsWith("typescript"))).toBe(false);
    expect(Object.keys(resolved).some((key) => key.endsWith("@types/node"))).toBe(false);
  });

  it("marks a catalog reference with no catalog entry as unresolved rather than throwing", () => {
    const orphan = JSON.stringify({
      name: "@verbatra/sdk",
      dependencies: { "not-in-any-catalog": "catalog:bundled" },
    });

    const resolved = resolvePublishedDependencies(WORKSPACE_YAML, [
      { path: "packages/sdk/package.json", json: orphan },
    ]);

    expect(resolved["@verbatra/sdk > not-in-any-catalog"]).toBe("unresolved");
  });
});

describe("diffResolvedDependencies", () => {
  it("reports a version change", () => {
    const changes = diffResolvedDependencies(
      { "@verbatra/sdk > openai": "6.46.0" },
      { "@verbatra/sdk > openai": "7.3.0" },
    );

    expect(changes).toEqual([
      { package: "@verbatra/sdk", dependency: "openai", from: "6.46.0", to: "7.3.0" },
    ]);
  });

  it("reports an added and a removed dependency", () => {
    const changes = diffResolvedDependencies(
      { "@verbatra/sdk > gone": "1.0.0" },
      { "@verbatra/sdk > fresh": "2.0.0" },
    );

    expect(changes).toEqual([
      { package: "@verbatra/sdk", dependency: "fresh", from: null, to: "2.0.0" },
      { package: "@verbatra/sdk", dependency: "gone", from: "1.0.0", to: null },
    ]);
  });

  it("reports nothing for an identical set", () => {
    const set = { "@verbatra/sdk > openai": "7.3.0", "@verbatra/cli > zod": "4.4.3" };

    expect(diffResolvedDependencies(set, { ...set })).toEqual([]);
  });

  it("catches a bundled catalog bump end to end, since no manifest changes with it", () => {
    const bumped = WORKSPACE_YAML.replace("openai: 7.3.0", "openai: 8.0.0");

    const changes = diffResolvedDependencies(
      resolvePublishedDependencies(WORKSPACE_YAML, manifests()),
      resolvePublishedDependencies(bumped, manifests()),
    );

    expect(changes).toEqual([
      { package: "@verbatra/sdk", dependency: "openai", from: "7.3.0", to: "8.0.0" },
    ]);
  });

  it("ignores a default-catalog bump that reaches no published package", () => {
    const bumped = WORKSPACE_YAML.replace("typescript: 6.0.3", "typescript: 7.0.0");

    const changes = diffResolvedDependencies(
      resolvePublishedDependencies(WORKSPACE_YAML, manifests()),
      resolvePublishedDependencies(bumped, manifests()),
    );

    expect(changes).toEqual([]);
  });

  it("reports nothing when only a pin's annotation changes", () => {
    const annotated = WORKSPACE_YAML.replace("openai: 7.3.0", "openai: 7.3.0 # deliberate");

    const changes = diffResolvedDependencies(
      resolvePublishedDependencies(WORKSPACE_YAML, manifests()),
      resolvePublishedDependencies(annotated, manifests()),
    );

    expect(changes).toEqual([]);
  });
});

describe("parseChangesetPackages", () => {
  it("reads quoted package names out of the frontmatter", () => {
    const changeset = '---\n"@verbatra/cli": patch\n"@verbatra/sdk": minor\n---\n\nA summary.\n';

    expect(parseChangesetPackages(changeset)).toEqual(["@verbatra/cli", "@verbatra/sdk"]);
  });

  it("reads unquoted package names", () => {
    expect(parseChangesetPackages("---\nsome-package: patch\n---\n\nText.\n")).toEqual([
      "some-package",
    ]);
  });

  it("returns nothing for a file with no frontmatter, which is how the README is ignored", () => {
    expect(parseChangesetPackages("# Changesets\n\nHello there.\n")).toEqual([]);
  });

  it("parses the repository's real changeset README as naming no package", () => {
    const readme = readFileSync(resolve(REPO_ROOT, ".changeset/README.md"), "utf8");

    expect(parseChangesetPackages(readme)).toEqual([]);
  });
});

describe("namesPublishedPackage", () => {
  const published = ["@verbatra/cli", "@verbatra/sdk", "@verbatra/studio"];

  it("accepts a changeset naming a published package", () => {
    expect(namesPublishedPackage(['---\n"@verbatra/sdk": patch\n---\n'], published)).toBe(true);
  });

  it("rejects a changeset naming only a private package", () => {
    expect(namesPublishedPackage(['---\n"@verbatra/core": patch\n---\n'], published)).toBe(false);
  });

  it("rejects an empty changeset list", () => {
    expect(namesPublishedPackage([], published)).toBe(false);
  });
});

describe("isReleaseBranch", () => {
  it("recognizes the Version Packages branch for the configured base branch", () => {
    expect(isReleaseBranch("changeset-release/main", "main")).toBe(true);
  });

  it("does not treat an ordinary branch as a release branch", () => {
    expect(isReleaseBranch("fix/something", "main")).toBe(false);
    expect(isReleaseBranch("main", "main")).toBe(false);
    expect(isReleaseBranch(undefined, "main")).toBe(false);
  });

  it("refuses a lookalike branch, since a head ref is author-controlled", () => {
    expect(isReleaseBranch("changeset-release/i-just-named-it-this", "main")).toBe(false);
    expect(isReleaseBranch("changeset-release/main-but-not-really", "main")).toBe(false);
    expect(isReleaseBranch("feat/changeset-release/main", "main")).toBe(false);
  });

  it("follows a different configured base branch", () => {
    expect(isReleaseBranch("changeset-release/develop", "develop")).toBe(true);
    expect(isReleaseBranch("changeset-release/main", "develop")).toBe(false);
  });
});

describe("evaluate", () => {
  const change = [{ package: "@verbatra/sdk", dependency: "openai", from: "6.46.0", to: "7.3.0" }];
  const disclosure = ['---\n"@verbatra/sdk": patch\n---\n\nBump openai.\n'];
  const context = { baseBranch: "main", published: ["@verbatra/sdk", "@verbatra/cli"] };

  it("fails a dependency change with no changeset", () => {
    expect(
      evaluate(change, [], { ...context, headBranch: "dependabot/npm_and_yarn/openai-7.3.0" }),
    ).toEqual({ ok: false, reason: "unaccompanied" });
  });

  it("passes a dependency change accompanied by a changeset naming a published package", () => {
    expect(evaluate(change, disclosure, { ...context, headBranch: "chore/bump-openai" })).toEqual({
      ok: true,
      reason: "accompanied",
    });
  });

  it("fails a dependency change whose only changeset names a private package", () => {
    expect(
      evaluate(change, ['---\n"@verbatra/core": patch\n---\n'], {
        ...context,
        headBranch: "chore/bump",
      }),
    ).toEqual({ ok: false, reason: "unaccompanied" });
  });

  it("passes when nothing consumer-facing changed", () => {
    expect(evaluate([], [], { ...context, headBranch: "chore/tidy" })).toEqual({
      ok: true,
      reason: "no-changes",
    });
  });

  it("exempts the Version Packages branch, which deletes changesets while bumping versions", () => {
    expect(evaluate(change, [], { ...context, headBranch: "changeset-release/main" })).toEqual({
      ok: true,
      reason: "release-branch",
    });
  });

  it("is not exempted by a bot-shaped branch name, the case the guard exists for", () => {
    for (const headBranch of [
      "dependabot/npm_and_yarn/openai-7.3.0",
      "dependabot/npm_and_yarn/multi-abc123",
      "renovate/openai-7.x",
    ]) {
      expect(evaluate(change, [], { ...context, headBranch }).ok).toBe(false);
    }
  });

  it("is not exempted by a branch merely shaped like the release branch", () => {
    expect(
      evaluate(change, [], { ...context, headBranch: "changeset-release/not-the-base" }).ok,
    ).toBe(false);
  });
});

describe("the script end to end in a real repository", () => {
  const fixtures = [];

  afterAll(() => {
    for (const dir of fixtures) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  function run(cwd, env = {}) {
    try {
      const stdout = execFileSync(process.execPath, [join(cwd, "scripts", SCRIPT_NAME)], {
        cwd,
        encoding: "utf8",
        env: { ...process.env, BASE_SHA: "", HEAD_BRANCH: "", ...env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { code: 0, output: stdout };
    } catch (error) {
      return { code: error.status ?? 1, output: `${error.stdout}${error.stderr}` };
    }
  }

  function git(cwd, args) {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  }

  function write(dir, relativePath, contents) {
    const full = join(dir, relativePath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }

  function makeRepo() {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "verbatra-guard-")));
    fixtures.push(dir);
    git(dir, ["init", "--quiet", "--initial-branch=main"]);
    git(dir, ["config", "user.email", "guard@example.test"]);
    git(dir, ["config", "user.name", "Guard Fixture"]);

    write(dir, "pnpm-workspace.yaml", WORKSPACE_YAML);
    write(dir, "packages/sdk/package.json", SDK_MANIFEST);
    write(dir, "packages/core/package.json", PRIVATE_MANIFEST);
    write(dir, ".changeset/config.json", JSON.stringify({ baseBranch: "main" }));
    write(dir, ".changeset/README.md", "# Changesets\n");
    cpSync(join(SCRIPT_DIR, SCRIPT_NAME), join(dir, "scripts", SCRIPT_NAME));
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "--quiet", "-m", "initial"]);
    return dir;
  }

  function bumpOpenai(dir, version) {
    write(
      dir,
      "pnpm-workspace.yaml",
      WORKSPACE_YAML.replace("openai: 7.3.0", `openai: ${version}`),
    );
  }

  function commit(dir, message) {
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "--quiet", "-m", message]);
    return git(dir, ["rev-parse", "HEAD"]);
  }

  it("fails a bundled bump with no changeset", () => {
    const dir = makeRepo();
    const base = git(dir, ["rev-parse", "HEAD"]);
    bumpOpenai(dir, "8.0.0");
    commit(dir, "bump openai");

    const result = run(dir, { BASE_SHA: base, HEAD_BRANCH: "dependabot/openai-8" });

    expect(result.code).toBe(1);
    expect(result.output).toContain("openai: 7.3.0 -> 8.0.0");
  });

  it("passes the same bump once a changeset naming a published package is added", () => {
    const dir = makeRepo();
    const base = git(dir, ["rev-parse", "HEAD"]);
    bumpOpenai(dir, "8.0.0");
    write(dir, ".changeset/bump.md", '---\n"@verbatra/sdk": patch\n---\n\nBump openai.\n');
    commit(dir, "bump openai with a changeset");

    const result = run(dir, { BASE_SHA: base, HEAD_BRANCH: "chore/bump" });

    expect(result.code).toBe(0);
    expect(result.output).toContain("accompanied by a changeset");
  });

  it("ignores a changeset that was already on the base branch", () => {
    const dir = makeRepo();
    write(dir, ".changeset/unrelated.md", '---\n"@verbatra/sdk": patch\n---\n\nSomething else.\n');
    const base = commit(dir, "an unrelated changeset lands on main");
    bumpOpenai(dir, "8.0.0");
    commit(dir, "bump openai");

    const result = run(dir, { BASE_SHA: base, HEAD_BRANCH: "chore/bump" });

    expect(result.code).toBe(1);
  });

  it("fails loudly when an explicit base ref is not in the clone", () => {
    const dir = makeRepo();

    const result = run(dir, { BASE_SHA: "1".repeat(40), HEAD_BRANCH: "chore/bump" });

    expect(result.code).toBe(1);
    expect(result.output).toContain("does not resolve");
    expect(result.output).toContain("fetch-depth");
  });

  it("takes the base from the merge ref's first parent, not a base sha that moved on", () => {
    const dir = makeRepo();
    const mergeBase = git(dir, ["rev-parse", "HEAD"]);

    git(dir, ["checkout", "--quiet", "-b", "feature"]);
    write(dir, "packages/sdk/README.md", "docs only\n");
    commit(dir, "docs only");

    git(dir, ["checkout", "--quiet", "main"]);
    git(dir, ["merge", "--quiet", "--no-ff", "-m", "merge ref", "feature"]);
    const mergeRef = git(dir, ["rev-parse", "HEAD"]);

    git(dir, ["checkout", "--quiet", "-b", "advanced-main"]);
    bumpOpenai(dir, "9.9.9");
    const advancedBase = commit(dir, "unrelated bundled bump on the base branch");

    git(dir, ["checkout", "--quiet", mergeRef]);
    const result = run(dir, {
      BASE_SHA: advancedBase,
      HEAD_SHA: git(dir, ["rev-parse", "HEAD^2"]),
      HEAD_BRANCH: "feature",
    });

    expect(git(dir, ["rev-parse", "HEAD^1"])).toBe(mergeBase);
    expect(result.code).toBe(0);
    expect(result.output).toContain("no published package's resolved dependencies changed");
  });

  it("treats the all-zero base a branch-creating push reports as absent", () => {
    const dir = makeRepo();
    bumpOpenai(dir, "8.0.0");
    commit(dir, "bump openai");

    const result = run(dir, { BASE_SHA: "0".repeat(40), HEAD_BRANCH: "chore/bump" });

    expect(result.code).toBe(0);
    expect(result.output).toContain("nothing to compare against");
  });

  it("uses the base it was given when HEAD is an ordinary merge commit", () => {
    const dir = makeRepo();
    const base = git(dir, ["rev-parse", "HEAD"]);
    bumpOpenai(dir, "8.0.0");
    commit(dir, "bump openai early, no changeset");
    git(dir, ["checkout", "--quiet", "-b", "side"]);
    write(dir, "NOTE.md", "docs\n");
    commit(dir, "an unrelated later commit");
    git(dir, ["checkout", "--quiet", "main"]);
    git(dir, ["merge", "--quiet", "--no-ff", "-m", "merge the side branch", "side"]);

    const result = run(dir, { BASE_SHA: base, HEAD_BRANCH: "integration" });

    expect(git(dir, ["rev-list", "--parents", "-n", "1", "HEAD"]).split(/\s+/)).toHaveLength(3);
    expect(result.code).toBe(1);
    expect(result.output).toContain("openai: 7.3.0 -> 8.0.0");
  });

  it("prefers the merge ref's first parent only when HEAD_SHA proves it is one", () => {
    const dir = makeRepo();
    const staleBase = git(dir, ["rev-parse", "HEAD"]);
    git(dir, ["checkout", "--quiet", "-b", "feature"]);
    write(dir, "NOTE.md", "docs only\n");
    const featureTip = commit(dir, "docs only");
    git(dir, ["checkout", "--quiet", "main"]);
    bumpOpenai(dir, "9.9.9");
    commit(dir, "unrelated bump on the base branch");
    git(dir, ["merge", "--quiet", "--no-ff", "-m", "merge ref", "feature"]);

    expect(
      run(dir, { BASE_SHA: staleBase, HEAD_SHA: featureTip, HEAD_BRANCH: "feature" }).code,
    ).toBe(0);
    expect(run(dir, { BASE_SHA: staleBase, HEAD_BRANCH: "feature" }).code).toBe(1);
  });

  it("exempts the exact Version Packages branch and no lookalike", () => {
    const dir = makeRepo();
    const base = git(dir, ["rev-parse", "HEAD"]);
    bumpOpenai(dir, "8.0.0");
    commit(dir, "bump openai");

    expect(run(dir, { BASE_SHA: base, HEAD_BRANCH: "changeset-release/main" }).code).toBe(0);
    expect(run(dir, { BASE_SHA: base, HEAD_BRANCH: "changeset-release/sneaky" }).code).toBe(1);
  });

  it("does not gate a private package's dependency change", () => {
    const dir = makeRepo();
    const base = git(dir, ["rev-parse", "HEAD"]);
    write(
      dir,
      "packages/core/package.json",
      JSON.stringify({
        name: "@verbatra/core",
        private: true,
        dependencies: { zod: "catalog:", "some-internal-dep": "2.0.0" },
      }),
    );
    commit(dir, "bump a private package's dependency");

    expect(run(dir, { BASE_SHA: base, HEAD_BRANCH: "chore/bump" }).code).toBe(0);
  });

  it("guards a package the moment it stops being private", () => {
    const dir = makeRepo();
    const base = git(dir, ["rev-parse", "HEAD"]);
    write(
      dir,
      "packages/core/package.json",
      JSON.stringify({
        name: "@verbatra/core",
        dependencies: { zod: "catalog:", "some-internal-dep": "1.0.0" },
      }),
    );
    commit(dir, "publish the core package");

    const result = run(dir, { BASE_SHA: base, HEAD_BRANCH: "chore/publish-core" });

    expect(result.code).toBe(1);
    expect(result.output).toContain("@verbatra/core > some-internal-dep");
  });

  it("does not report a change when a package directory merely moves", () => {
    const dir = makeRepo();
    const base = git(dir, ["rev-parse", "HEAD"]);
    mkdirSync(join(dir, "apps"), { recursive: true });
    git(dir, ["mv", "packages/sdk", "apps/sdk"]);
    commit(dir, "move the package between workspace globs");

    const result = run(dir, { BASE_SHA: base, HEAD_BRANCH: "chore/move" });

    expect(result.code).toBe(0);
  });
});
