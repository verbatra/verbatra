import { execa } from "execa";
import { beforeAll, describe, expect, it } from "vitest";
import { type Consumer, makeConsumer, writeFileIn } from "../src/harness.js";

const PLUGIN = `import { createFlatFileAdapter } from "@verbatra/sdk";

const TOKEN = /\\{[a-z]+\\}/g;

function tokensIn(value) {
  return [...value.matchAll(TOKEN)].map((match) => match[0]);
}

export function createKvAdapter() {
  return createFlatFileAdapter({
    format: "custom:kv",
    extensions: [".kv"],
    parseEntries(content, namespace) {
      const entries = new Map();
      for (const line of content.split("\\n")) {
        if (line.trim() === "") {
          continue;
        }
        const separator = line.indexOf("=");
        const key = line.slice(0, separator);
        const value = line.slice(separator + 1);
        entries.set(key, { key, namespace, value, placeholders: tokensIn(value), isPlural: false });
      }
      return entries;
    },
    serializeEntries(entries) {
      return [...entries].map(([key, entry]) => key + "=" + entry.value).join("\\n") + "\\n";
    },
    extractPlaceholders: tokensIn,
  });
}
`;

const RUNNER = `import { check, createDefaultRegistry, loadConfig } from "@verbatra/sdk";
import { createKvAdapter } from "./plugin.mjs";

const config = await loadConfig({ cwd: process.cwd() });
const adapterRegistry = createDefaultRegistry().register(createKvAdapter());
const summary = await check({ config, cwd: process.cwd() }, { adapterRegistry });

console.log(JSON.stringify({ format: config.format, summary }));
`;

const KEYLESS_RUNNER = `import { check, loadConfig } from "@verbatra/sdk";

const config = await loadConfig({ cwd: process.cwd() });
try {
  await check({ config, cwd: process.cwd() }, {});
  console.log(JSON.stringify({ code: "none", message: "" }));
} catch (error) {
  console.log(JSON.stringify({ code: error.code, message: error.message }));
}
`;

const CONFIG = JSON.stringify(
  {
    sourceLocale: "en",
    targetLocales: ["de"],
    format: "custom:kv",
    files: { pattern: "locales/{locale}.kv" },
    provider: { id: "deepl", options: {} },
  },
  null,
  2,
);

interface CheckReport {
  format: string;
  summary: { inSync: boolean; locales: { locale: string; missing: number }[] };
}

async function runNode(consumer: Consumer, script: string): Promise<string> {
  const result = await execa("node", [script], { cwd: consumer.dir, reject: false });
  if (result.exitCode !== 0) {
    throw new Error(`node ${script} exited ${result.exitCode}: ${result.stderr}`);
  }
  return result.stdout;
}

describe("a format adapter shipped outside verbatra", () => {
  let consumer: Consumer;

  beforeAll(async () => {
    consumer = await makeConsumer();
    await writeFileIn(consumer.dir, ".verbatrarc.json", CONFIG);
    await writeFileIn(consumer.dir, "plugin.mjs", PLUGIN);
    await writeFileIn(consumer.dir, "run.mjs", RUNNER);
    await writeFileIn(consumer.dir, "run-without-plugin.mjs", KEYLESS_RUNNER);
    await writeFileIn(consumer.dir, "locales/en.kv", "greeting=Hello {name}\nfarewell=Bye\n");
    await writeFileIn(consumer.dir, "locales/de.kv", "greeting=Hallo {name}\n");
  }, 240_000);

  it("is built from the published tarball and drives a real SDK flow", async () => {
    const report = JSON.parse(await runNode(consumer, "run.mjs")) as CheckReport;

    expect(report.format).toBe("custom:kv");
    expect(report.summary.inSync).toBe(false);
    expect(report.summary.locales).toEqual([expect.objectContaining({ locale: "de", missing: 1 })]);
  });

  it("leaves a structured, named failure when the project forgets to register it", async () => {
    const failure = JSON.parse(await runNode(consumer, "run-without-plugin.mjs")) as {
      code: string;
      message: string;
    };

    expect(failure.code).toBe("UNKNOWN_FORMAT");
    expect(failure.message).toContain("custom:kv");
  });
});
