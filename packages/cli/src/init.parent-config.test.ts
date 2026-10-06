import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit } from "./init.js";
import { captureStreams } from "./test-support.js";

describe("runInit in a subdirectory of a configured project", () => {
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "verbatra-init-parent-")));
    mkdirSync(join(root, ".git"));
    mkdirSync(join(root, "packages", "a"), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("warns that the new config takes the place of the parent's config", async () => {
    writeFileSync(join(root, ".verbatrarc.json"), "{}");
    const cap = captureStreams();

    const code = await runInit(
      { cwd: join(root, "packages", "a"), provider: "deepl", format: "i18next-json", yes: true },
      cap.streams,
      { isTty: () => false },
    );

    expect(code).toBe(0);
    expect(cap.err()).toContain(`the config in ${root} also covers this directory`);
  });

  it("says the new config would take the parent's place under --dry-run", async () => {
    writeFileSync(join(root, ".verbatrarc.json"), "{}");
    const cap = captureStreams();

    await runInit(
      {
        cwd: join(root, "packages", "a"),
        provider: "deepl",
        format: "i18next-json",
        yes: true,
        dryRun: true,
      },
      cap.streams,
      { isTty: () => false },
    );

    expect(cap.err()).toContain("would take its place");
  });

  it("stays quiet when no parent directory holds a config", async () => {
    const cap = captureStreams();

    await runInit(
      { cwd: join(root, "packages", "a"), provider: "deepl", format: "i18next-json", yes: true },
      cap.streams,
      { isTty: () => false },
    );

    expect(cap.err()).not.toContain("also covers this directory");
  });
});
