import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  fillWorkbook,
  parseEnvelope,
  readJsonIn,
  readSharedConsumer,
  runVerbatra,
  writeJsonIn,
} from "../src/harness.js";

interface RunSummaryJson {
  locales: {
    translated: string[];
    protected: { key: string; reason: string }[];
  }[];
}

interface CheckJson {
  locales: { stale: number; protected?: number }[];
}

interface DiffJson {
  locales: { changed: string[]; protected?: string[] }[];
}

const config = {
  sourceLocale: "en",
  targetLocales: ["de"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "anthropic", options: { model: "claude-sonnet-4-5", maxTokens: 1024 } },
};

let consumer: Consumer;

beforeAll(async () => {
  consumer = await readSharedConsumer();
}, 180_000);

function result<TResult>(stdout: string): TResult {
  const envelope = parseEnvelope<TResult>(stdout);
  if (!envelope.ok) {
    throw new Error(`Expected a success envelope, got [${envelope.code}]`);
  }
  return envelope.result;
}

describe("protecting human translations (keyless)", () => {
  it("reports an imported value whose source changed as protected, not as to translate", async () => {
    const dir = join(consumer.dir, "protect-human");
    await mkdir(dir, { recursive: true });
    await writeJsonIn(dir, ".verbatrarc.json", config);
    await writeJsonIn(dir, "locales/en.json", { greeting: "Hello", farewell: "Goodbye" });
    const run = (args: string[]) =>
      runVerbatra(consumer, [...args, "--cwd", dir], { env: { ANTHROPIC_API_KEY: "" } });

    const workbookPath = join(dir, "handoff.xlsx");
    expect((await run(["export", "--out", workbookPath])).exitCode).toBe(0);
    await fillWorkbook(workbookPath, (key) => (key === "greeting" ? "Hallo" : "Tschuss"));
    expect((await run(["import", workbookPath])).exitCode).toBe(0);

    await writeJsonIn(dir, "locales/en.json", { greeting: "Hello there", farewell: "Goodbye" });

    const planned = await run(["translate", "--dry-run", "--json"]);
    expect(planned.exitCode).toBe(0);
    const plan = result<RunSummaryJson>(planned.stdout);
    expect(plan.locales[0]?.protected).toEqual([{ key: "greeting", reason: "import" }]);
    expect(plan.locales[0]?.translated).toEqual([]);

    const overridden = result<RunSummaryJson>(
      (await run(["translate", "--dry-run", "--include-human", "--json"])).stdout,
    );
    expect(overridden.locales[0]?.translated).toEqual(["greeting"]);

    const checked = await run(["check", "--json"]);
    expect(checked.exitCode).toBe(1);
    expect(result<CheckJson>(checked.stdout).locales[0]).toMatchObject({ stale: 1, protected: 1 });

    const drift = result<DiffJson>((await run(["diff", "--json"])).stdout);
    expect(drift.locales[0]).toMatchObject({ changed: ["greeting"], protected: ["greeting"] });

    expect(await readJsonIn<Record<string, string>>(dir, "locales/de.json")).toEqual({
      greeting: "Hallo",
      farewell: "Tschuss",
    });
  });
});
