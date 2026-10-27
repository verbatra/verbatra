import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  parseEnvelope,
  readJsonIn,
  readSharedConsumer,
  runVerbatra,
  writeJsonIn,
} from "../src/harness.js";

interface RunSummaryJson {
  locales: {
    locale: string;
    translated: string[];
    unfilled?: string[];
    integrityMismatches: string[];
    notices: { code: string }[];
  }[];
}

interface ExportJson {
  path: string;
  locales: { locale: string; rows: number }[];
}

interface ProvenanceJson {
  locales: Record<
    string,
    Record<string, { origin: string; reviewState?: string; reviewer?: string }>
  >;
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
    throw new Error(`Expected a success envelope, got [${envelope.code}] ${envelope.message}`);
  }
  return envelope.result;
}

function fillUnit(xml: string, key: string, target: string, state: string): string {
  const unit = new RegExp(`<unit id="(u\\d+)" name="${key}">([\\s\\S]*?)</unit>`);
  return xml.replace(unit, (_whole, id: string, body: string) => {
    const filled = body
      .replace(/<segment state="[^"]*">/, `<segment state="${state}">`)
      .replace("</segment>", `  <target>${target}</target>\n      </segment>`);
    return `<unit name="${key}" id="${id}">${filled}</unit>`;
  });
}

describe("XLIFF handoff (keyless)", () => {
  it("exports XLIFF 2.0, imports what a CAT tool filled, and records the review", async () => {
    const dir = join(consumer.dir, "xliff-handoff");
    await mkdir(dir, { recursive: true });
    await writeJsonIn(dir, ".verbatrarc.json", config);
    await writeJsonIn(dir, "locales/en.json", {
      greeting: "Hello {{name}}!",
      farewell: "Goodbye",
      title: "Settings",
    });
    const run = (args: string[]) =>
      runVerbatra(consumer, [...args, "--cwd", dir], { env: { ANTHROPIC_API_KEY: "" } });

    const exported = await run(["export", "--format", "xliff2", "--out", "handoff", "--json"]);
    expect(exported.exitCode).toBe(0);
    expect(result<ExportJson>(exported.stdout).locales).toEqual([{ locale: "de", rows: 3 }]);

    const path = join(dir, "handoff", "de.xlf");
    const xml = await readFile(path, "utf8");
    expect(xml).toContain('<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0"');
    expect(xml).toContain('<ph id="1" dataRef="d1" disp="{{name}}" equiv="{{name}}"/>');
    const greetingSource = /name="greeting">[\s\S]*?<source>([\s\S]*?)<\/source>/.exec(xml)?.[1];
    expect(greetingSource).toBeDefined();
    const greetingTarget = (greetingSource ?? "").replace("Hello", "Hallo");
    await writeFile(
      path,
      fillUnit(
        fillUnit(xml, "greeting", greetingTarget, "translated"),
        "farewell",
        "Tschüss",
        "final",
      ),
      "utf8",
    );

    const dry = await run(["import", "handoff/de.xlf", "--dry-run", "--json"]);
    expect(dry.exitCode).toBe(0);
    expect(await readFile(join(dir, "locales", "de.json"), "utf8").catch(() => "absent")).toBe(
      "absent",
    );

    const imported = await run(["import", "handoff/de.xlf", "--reviewer", "Ana", "--json"]);
    expect(imported.exitCode).toBe(0);
    const summary = result<RunSummaryJson>(imported.stdout).locales[0];
    expect(summary?.translated).toEqual(["farewell", "greeting"]);
    expect(summary?.unfilled).toEqual(["title"]);
    expect(summary?.integrityMismatches).toEqual([]);
    expect(summary?.notices.map((notice) => notice.code)).toContain("HANDOFF_REVIEWS_RECORDED");

    expect(await readJsonIn<Record<string, string>>(dir, "locales/de.json")).toEqual({
      greeting: "Hallo {{name}}!",
      farewell: "Tschüss",
    });
    const provenance = await readJsonIn<ProvenanceJson>(dir, "verbatra.provenance.json");
    expect(provenance.locales.de?.farewell).toMatchObject({
      origin: "import",
      reviewState: "approved",
      reviewer: "Ana",
    });
    expect(provenance.locales.de?.greeting).toMatchObject({ origin: "import" });
    expect(provenance.locales.de?.greeting).not.toHaveProperty("reviewState");
  });
});
