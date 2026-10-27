import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { baseConfig, makeTempDir } from "../test-support.js";
import { loadConfig } from "./load-config.js";

const { homedirMock } = vi.hoisted(() => ({
  homedirMock: vi.fn(() => "/definitely-not-an-ancestor-of-any-real-temp-dir-xyz"),
}));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: homedirMock };
});

describe("loadConfig upward search: home-directory fallback when there is no .git ancestor", () => {
  it("does not search above cwd when the home directory is not an ancestor of cwd", async () => {
    homedirMock.mockReturnValue("/definitely-not-an-ancestor-of-any-real-temp-dir-xyz");
    const parent = await makeTempDir();
    await writeFile(
      join(parent, "verbatra.config.ts"),
      `export default ${JSON.stringify(baseConfig({ sourceLocale: "should-not-be-found" }))};`,
      "utf8",
    );
    const nested = join(parent, "nested");
    await mkdir(nested, { recursive: true });

    await expect(loadConfig({ cwd: nested })).rejects.toMatchObject({ code: "CONFIG_NOT_FOUND" });
  });

  it("still finds a config placed directly in cwd when the home directory is unrelated", async () => {
    homedirMock.mockReturnValue("/definitely-not-an-ancestor-of-any-real-temp-dir-xyz");
    const dir = await makeTempDir();
    await writeFile(
      join(dir, ".verbatrarc.json"),
      JSON.stringify(baseConfig({ sourceLocale: "en" })),
      "utf8",
    );

    const config = await loadConfig({ cwd: dir });

    expect(config.sourceLocale).toBe("en");
  });

  it("searches up to the home directory when it is a real ancestor of cwd", async () => {
    const home = await makeTempDir();
    homedirMock.mockReturnValue(home);
    await writeFile(
      join(home, "verbatra.config.ts"),
      `export default ${JSON.stringify(baseConfig({ sourceLocale: "fr" }))};`,
      "utf8",
    );
    const nested = join(home, "workspace", "project");
    await mkdir(nested, { recursive: true });

    const config = await loadConfig({ cwd: nested });

    expect(config.sourceLocale).toBe("fr");
  });
});
