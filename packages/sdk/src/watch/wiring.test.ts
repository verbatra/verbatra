import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultCreateWatcher } from "./wiring.js";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function until(condition: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) {
    await wait(25);
  }
}

describe("defaultCreateWatcher: real chokidar behavior", () => {
  let root: string;
  let source: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "verbatra-sdk-watcher-"));
    source = join(root, "en.json");
    await writeFile(source, JSON.stringify({ greeting: "hello" }));
    await wait(300);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reports an in-place save of the watched file", async () => {
    const watcher = defaultCreateWatcher([source]);
    let changes = 0;
    watcher.onChange(() => {
      changes += 1;
    });
    await wait(200);

    await writeFile(source, JSON.stringify({ greeting: "hallo" }));
    await until(() => changes > 0, 3000);

    expect(changes).toBeGreaterThanOrEqual(1);
    await watcher.close();
  }, 8000);

  it("reports the watched file coming back after it was deleted", async () => {
    const watcher = defaultCreateWatcher([source]);
    let changes = 0;
    watcher.onChange(() => {
      changes += 1;
    });
    await wait(200);

    await unlink(source);
    await wait(300);
    await writeFile(source, JSON.stringify({ greeting: "again" }));
    await until(() => changes > 0, 3000);

    expect(changes).toBeGreaterThanOrEqual(1);
    await watcher.close();
  }, 8000);

  it("stays quiet when nothing changes", async () => {
    const watcher = defaultCreateWatcher([source]);
    let changes = 0;
    watcher.onChange(() => {
      changes += 1;
    });

    await wait(500);

    expect(changes).toBe(0);
    await watcher.close();
  }, 8000);
});
