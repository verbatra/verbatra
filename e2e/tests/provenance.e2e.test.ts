import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  fillWorkbook,
  parseEnvelope,
  readSharedConsumer,
  runVerbatra,
  writeJsonIn,
} from "../src/harness.js";

interface CheckJson {
  locales: { locale: string; provenance?: { byOrigin: Record<string, number> } }[];
}

const config = {
  sourceLocale: "en",
  targetLocales: ["de"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "none", options: {} },
};

let consumer: Consumer;

beforeAll(async () => {
  consumer = await readSharedConsumer();
}, 180_000);

describe("provenance file (keyless)", () => {
  it("records an import and stays byte-identical across no-op runs", async () => {
    const dir = join(consumer.dir, "provenance-file");
    await mkdir(dir, { recursive: true });
    await writeJsonIn(dir, ".verbatrarc.json", config);
    await writeJsonIn(dir, "locales/en.json", { greeting: "Hello", farewell: "Goodbye" });
    const run = (args: string[]) => runVerbatra(consumer, [...args, "--cwd", dir]);

    const workbookPath = join(dir, "handoff.xlsx");
    expect((await run(["export", "--out", workbookPath])).exitCode).toBe(0);
    await fillWorkbook(workbookPath, (key) => (key === "greeting" ? "Hallo" : "Tschuss"));
    expect((await run(["import", workbookPath])).exitCode).toBe(0);

    const provenancePath = join(dir, "verbatra.provenance.json");
    const written = await readFile(provenancePath, "utf8");
    const parsed = JSON.parse(written) as {
      version: number;
      locales: Record<string, Record<string, { origin: string }>>;
    };
    expect(parsed.version).toBe(1);
    expect(parsed.locales.de?.greeting?.origin).toBe("import");
    expect(parsed.locales.de?.farewell?.origin).toBe("import");
    const writtenAt = (await stat(provenancePath)).mtimeMs;

    const checked = await run(["check", "--json"]);
    expect(checked.exitCode).toBe(0);
    const envelope = parseEnvelope<CheckJson>(checked.stdout);
    expect(envelope.ok && envelope.result.locales[0]?.provenance?.byOrigin.import).toBe(2);

    expect((await run(["translate"])).exitCode).toBe(0);
    expect((await run(["import", workbookPath])).exitCode).toBe(0);

    expect(await readFile(provenancePath, "utf8")).toBe(written);
    expect((await stat(provenancePath)).mtimeMs).toBe(writtenAt);
  });
});
