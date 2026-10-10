import { access, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  parseEnvelope,
  readSharedConsumer,
  runVerbatra,
  writeJsonIn,
} from "../src/harness.js";

interface CheckJson {
  inSync: boolean;
  locales: { locale: string; missing: number; upToDate: number }[];
}

let consumer: Consumer;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function projectWithSubdirectory(name: string): Promise<{ root: string; nested: string }> {
  const root = join(consumer.dir, `subdirectory-${name}`);
  await mkdir(join(root, ".git"), { recursive: true });
  await writeJsonIn(root, ".verbatrarc.json", {
    sourceLocale: "en",
    targetLocales: ["de"],
    format: "i18next-json",
    files: { pattern: "locales/{locale}.json" },
    provider: { id: "none" },
  });
  await writeJsonIn(root, "locales/en.json", { greeting: "Hello", farewell: "Bye" });
  await writeJsonIn(root, "locales/de.json", { greeting: "Hallo" });
  const nested = join(root, "src", "components");
  await writeJsonIn(nested, "locales/en.json", { decoy: "Decoy" });
  await writeJsonIn(nested, "locales/de.json", { decoy: "Attrappe" });
  return { root, nested };
}

beforeAll(async () => {
  consumer = await readSharedConsumer();
});

describe("a command run from a subdirectory of the project", () => {
  it("check reads the locale files next to the config the search found", async () => {
    const { nested } = await projectWithSubdirectory("check");

    const result = await runVerbatra(consumer, ["check", "--json"], { cwd: nested });

    expect(result.exitCode).toBe(1);
    const envelope = parseEnvelope<CheckJson>(result.stdout);
    expect(envelope.ok).toBe(true);
    if (envelope.ok) {
      expect(envelope.result.locales).toEqual([
        expect.objectContaining({ locale: "de", missing: 1, upToDate: 1 }),
      ]);
    }
  });

  it("translate writes the lock file at the project root, never in the subdirectory", async () => {
    const { root, nested } = await projectWithSubdirectory("translate");

    const result = await runVerbatra(consumer, ["translate", "--json"], { cwd: nested });

    expect(result.exitCode).toBe(3);
    expect(await exists(join(root, "verbatra.lock.json"))).toBe(true);
    expect(await exists(join(nested, "verbatra.lock.json"))).toBe(false);
    expect(await readFile(join(nested, "locales", "de.json"), "utf8")).toContain("Attrappe");
  });
});
