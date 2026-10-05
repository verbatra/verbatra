import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, diff } from "@verbatra/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./run.js";
import { captureStreams, makeConfig, recordingDeps } from "./test-support.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function respelledProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "verbatra-cli-respell-"));
  dirs.push(dir);
  await mkdir(join(dir, "locales"));
  await writeFile(join(dir, "locales", "en.json"), JSON.stringify({ a: "A new", b: "B" }));
  await writeFile(join(dir, "locales", "pt-BR.json"), JSON.stringify({ a: "Ap", b: "Bp" }));
  await writeFile(
    join(dir, "verbatra.lock.json"),
    JSON.stringify({ version: 1, locales: { pt_BR: { a: "0000000000000000" } } }),
  );
  return dir;
}

const config = makeConfig({ targetLocales: ["pt-BR"] });

describe("run check and diff: state recorded under a respelled locale", () => {
  it("check exits 1 and reports the stale key without moving the state", async () => {
    const dir = await respelledProject();
    const lockBefore = await readFile(join(dir, "verbatra.lock.json"), "utf8");
    const { deps } = recordingDeps({ loadConfig: async () => config, check });
    const cap = captureStreams();

    const code = await run(["check", "--cwd", dir, "--locales", "pt-BR"], deps, cap.streams);

    expect(code).toBe(1);
    expect(cap.out()).toContain("pt-BR: 0 missing, 1 stale, 1 up-to-date (out of sync)");
    expect(await readFile(join(dir, "verbatra.lock.json"), "utf8")).toBe(lockBefore);
  });

  it("diff exits 1 and names the key to re-translate", async () => {
    const dir = await respelledProject();
    const { deps } = recordingDeps({ loadConfig: async () => config, diff });
    const cap = captureStreams();

    const code = await run(["diff", "--cwd", dir], deps, cap.streams);

    expect(code).toBe(1);
    expect(cap.out()).toContain("re-translate: a");
  });
});
