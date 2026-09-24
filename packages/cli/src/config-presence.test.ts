import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configSearchChain, hasConfigFile } from "./config-presence.js";

describe("configSearchChain", () => {
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "verbatra-presence-")));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("walks up to the nearest directory holding .git", () => {
    const pkg = join(root, "repo", "packages", "web");
    mkdirSync(pkg, { recursive: true });
    mkdirSync(join(root, "repo", ".git"));

    expect(configSearchChain(pkg, "/nowhere")).toEqual([
      pkg,
      join(root, "repo", "packages"),
      join(root, "repo"),
    ]);
  });

  it("walks up to the home directory when there is no .git and home is an ancestor", () => {
    const project = join(root, "home", "me", "app");
    mkdirSync(project, { recursive: true });

    expect(configSearchChain(project, join(root, "home"))).toEqual([
      project,
      join(root, "home", "me"),
      join(root, "home"),
    ]);
  });

  it("looks only in the directory itself outside the home tree without a .git", () => {
    expect(configSearchChain(root, join(dirname(root), "elsewhere"))).toEqual([root]);
    expect(configSearchChain(root, root)).toEqual([root]);
  });
});

describe("hasConfigFile", () => {
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "verbatra-presence-")));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("finds a config at the repository root from a nested package without executing it", () => {
    const pkg = join(root, "packages", "web");
    mkdirSync(pkg, { recursive: true });
    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, "verbatra.config.ts"), "throw new Error('executed');");

    expect(hasConfigFile(pkg, "/nowhere")).toBe(true);
  });

  it.each([
    ["no file", undefined],
    ["a package.json without a verbatra property", '{"name":"app"}'],
    ["a package.json that is not valid JSON", "{"],
    ["a package.json that is not an object", "42"],
  ])("finds nothing with %s", (_label, manifest) => {
    if (manifest !== undefined) {
      writeFileSync(join(root, "package.json"), manifest);
    }

    expect(hasConfigFile(root, "/nowhere")).toBe(false);
  });
});
