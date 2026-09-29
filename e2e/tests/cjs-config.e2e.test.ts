import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  parseEnvelope,
  readSharedConsumer,
  runVerbatra,
  writeFileIn,
  writeJsonIn,
} from "../src/harness.js";

interface CheckSummaryJson {
  inSync: boolean;
  locales: { locale: string; missing: number }[];
}

const CONFIG_BODY = `{
  sourceLocale: "en",
  targetLocales: ["de"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "none" },
}`;

let consumer: Consumer;

beforeAll(async () => {
  consumer = await readSharedConsumer();
}, 180_000);

async function seedCjsProject(name: string, packageName: string): Promise<string> {
  const dir = join(consumer.dir, name);
  await mkdir(dir, { recursive: true });
  await writeJsonIn(dir, "locales/en.json", { greeting: "Hello", farewell: "Goodbye" });
  await writeJsonIn(dir, "locales/de.json", { greeting: "Hallo" });
  await writeFileIn(
    dir,
    "verbatra.config.cjs",
    `const { defineConfig } = require("${packageName}");\n\nmodule.exports = defineConfig(${CONFIG_BODY});\n`,
  );
  return dir;
}

describe("a .cjs config", () => {
  it.each(["@verbatra/cli", "@verbatra/sdk"])(
    "loads when it requires defineConfig from %s",
    async (packageName) => {
      const dir = await seedCjsProject(`cjs-config-${packageName.split("/")[1]}`, packageName);

      const result = await runVerbatra(consumer, ["check", "--json", "--cwd", dir]);

      expect(result.exitCode).toBe(1);
      const envelope = parseEnvelope<CheckSummaryJson>(result.stdout);
      if (!envelope.ok) {
        throw new Error(
          `Expected a check success envelope, got [${envelope.code}] ${envelope.message}`,
        );
      }
      expect(envelope.result.locales).toEqual([
        expect.objectContaining({ locale: "de", missing: 1 }),
      ]);
    },
  );

  it("names the unresolved import, its cause code and an import hint when a package is missing", async () => {
    const dir = await seedCjsProject("cjs-config-missing-package", "@verbatra/not-installed");
    await expectUnresolvedImport(dir);
  });

  it("gives a .ts config with a missing package the same cause code and hint", async () => {
    const dir = await seedCjsProject("ts-config-missing-package", "@verbatra/not-installed");
    await rm(join(dir, "verbatra.config.cjs"));
    await writeFileIn(
      dir,
      "verbatra.config.ts",
      `import { defineConfig } from "@verbatra/not-installed";\n\nexport default defineConfig(${CONFIG_BODY});\n`,
    );
    await expectUnresolvedImport(dir);
  });
});

async function expectUnresolvedImport(dir: string): Promise<void> {
  const result = await runVerbatra(consumer, ["check", "--json", "--cwd", dir]);

  expect(result.exitCode).toBe(2);
  const envelope = parseEnvelope(result.stdout);
  if (envelope.ok) {
    throw new Error("Expected a check error envelope");
  }
  expect(envelope.code).toBe("CONFIG_INVALID");
  expect(envelope.message).toContain("@verbatra/not-installed");
  expect(envelope.causeCode).toBe("MODULE_NOT_FOUND");
  expect(envelope.hint).toContain("the config file imports");
  expect(result.stderr).toContain("(cause: MODULE_NOT_FOUND)");
}
