import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { baseConfig, type GitFixture, makeGitFixture } from "../test-support.js";
import { localeGitDiff } from "./git-diff.js";
import { localeGitStatus } from "./git-status.js";

const fixtures: GitFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((created) => created.cleanup()));
});

async function monorepo(): Promise<{ readonly fx: GitFixture; readonly app: string }> {
  const fx = await makeGitFixture();
  fixtures.push(fx);
  const app = join(fx.root, "app");
  await fx.write("shared/en.json", '{"a":"A"}\n');
  await fx.write("shared/de.json", '{"a":"Alt"}\n');
  await fx.write("app/verbatra.lock.json", "{}\n");
  await fx.commitAll();
  await fx.write("shared/de.json", '{"a":"Neu"}\n');
  return { fx, app };
}

const OUTSIDE = { files: { pattern: "../shared/{locale}.json" } };

describe("a files.pattern that leaves the project directory", () => {
  it("makes the status unavailable instead of reporting a clean project", async () => {
    const { app } = await monorepo();

    const status = await localeGitStatus({ config: baseConfig(OUTSIDE), cwd: app });

    expect(status).toEqual({ available: false, reason: "outside-project" });
  });

  it("makes the diff of a locale unavailable instead of an empty difference", async () => {
    const { app } = await monorepo();

    const diff = await localeGitDiff({ config: baseConfig(OUTSIDE), locale: "de", cwd: app });

    expect(diff).toEqual({ available: false, reason: "outside-project" });
  });

  it("makes the status unavailable when only one locale leaves the project", async () => {
    const { app } = await monorepo();
    const config = baseConfig({
      targetLocales: ["de", "fr"],
      files: { pattern: "{locale}.json" },
    });

    const inside = await localeGitStatus({ config, cwd: app });
    const mixed = await localeGitStatus({
      config: baseConfig({ ...OUTSIDE, targetLocales: ["de"] }),
      cwd: app,
    });

    expect(inside).toMatchObject({ available: true });
    expect(mixed).toEqual({ available: false, reason: "outside-project" });
  });

  it("still reads a project whose files stay inside the directory", async () => {
    const { fx, app } = await monorepo();
    await fx.write("locales/en.json", '{"a":"A"}\n', app);
    await fx.write("locales/de.json", '{"a":"a"}\n', app);
    await fx.commitAll();
    await fx.write("locales/de.json", '{"a":"b"}\n', app);

    const status = await localeGitStatus({ config: baseConfig(), cwd: app });

    expect(status).toMatchObject({
      available: true,
      files: [{ path: "locales/de.json", state: "modified" }],
    });
  });
});
