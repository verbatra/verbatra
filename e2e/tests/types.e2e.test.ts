import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  JSON_ENVELOPE_VERSION,
  PROVIDER_ENV_VARS,
  parseEnvelope,
  readSharedConsumer,
  runVerbatra,
  writeJsonIn,
} from "../src/harness.js";

interface TypesResultJson {
  path: string;
  sourcePath: string;
  keys: number;
  withArguments: number;
  unresolved: { key: string; reason: string }[];
  excluded: string[];
  plural: string[];
  written: boolean;
  stale: boolean;
  check: boolean;
}

const NO_PROVIDER_KEYS: Record<string, string> = Object.fromEntries(
  Object.values(PROVIDER_ENV_VARS).map((name) => [name, ""]),
);

const config = {
  sourceLocale: "en",
  targetLocales: ["de"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "gemini", options: { model: "gemini-2.5-flash", maxOutputTokens: 4096 } },
};

let consumer: Consumer;

async function seedProject(name: string): Promise<string> {
  const dir = join(consumer.dir, name);
  await mkdir(dir, { recursive: true });
  await writeJsonIn(dir, ".verbatrarc.json", config);
  await writeJsonIn(dir, "locales/en.json", {
    title: "Verbatra",
    greeting: "Hello {{name}}",
    class: "reserved word",
  });
  await writeJsonIn(dir, "locales/de.json", { title: "Verbatra" });
  return dir;
}

function successResult(stdout: string): TypesResultJson {
  const envelope = parseEnvelope<TypesResultJson>(stdout);
  if (!envelope.ok) {
    throw new Error(
      `Expected a types success envelope, got [${envelope.code}] ${envelope.message}`,
    );
  }
  expect(envelope.version).toBe(JSON_ENVELOPE_VERSION);
  expect(envelope.command).toBe("types");
  return envelope.result;
}

beforeAll(async () => {
  consumer = await readSharedConsumer();
}, 180_000);

describe("types (no provider, no key)", () => {
  it("generates a declaration with every provider key variable blank", async () => {
    const dir = await seedProject("types-basic");

    const result = await runVerbatra(consumer, ["types", "--json", "--cwd", dir], {
      env: NO_PROVIDER_KEYS,
    });

    expect(result.exitCode).toBe(0);
    const summary = successResult(result.stdout);
    expect(summary).toMatchObject({ keys: 3, withArguments: 1, written: true });
    expect(summary.path).toBe(join(dir, "verbatra-types.d.ts"));

    const declaration = await readFile(summary.path, "utf8");
    expect(declaration).toContain('"title": VerbatraNoArguments;');
    expect(declaration).toContain('"greeting": { readonly "name": VerbatraArgument };');
    expect(declaration).toContain('"class": VerbatraNoArguments;');
    expect(declaration).toContain("export type VerbatraMessageKey = keyof VerbatraMessages;");
  });

  it("writes the same bytes on a second run and reports nothing changed", async () => {
    const dir = await seedProject("types-idempotent");

    await runVerbatra(consumer, ["types", "--cwd", dir], { env: NO_PROVIDER_KEYS });
    const first = await readFile(join(dir, "verbatra-types.d.ts"), "utf8");
    const second = await runVerbatra(consumer, ["types", "--json", "--cwd", dir], {
      env: NO_PROVIDER_KEYS,
    });

    expect(successResult(second.stdout)).toMatchObject({ written: false, stale: false });
    expect(await readFile(join(dir, "verbatra-types.d.ts"), "utf8")).toBe(first);
  });

  it("exits 0 from --check right after generating, and 1 once the catalog moves on", async () => {
    const dir = await seedProject("types-check");

    await runVerbatra(consumer, ["types", "--cwd", dir], { env: NO_PROVIDER_KEYS });
    const current = await runVerbatra(consumer, ["types", "--check", "--cwd", dir], {
      env: NO_PROVIDER_KEYS,
    });
    const before = await readFile(join(dir, "verbatra-types.d.ts"), "utf8");

    await writeJsonIn(dir, "locales/en.json", { title: "Verbatra", added: "New key" });
    const stale = await runVerbatra(consumer, ["types", "--check", "--json", "--cwd", dir], {
      env: NO_PROVIDER_KEYS,
    });

    expect(current.exitCode).toBe(0);
    expect(stale.exitCode).toBe(1);
    expect(successResult(stale.stdout)).toMatchObject({ stale: true, written: false });
    expect(await readFile(join(dir, "verbatra-types.d.ts"), "utf8")).toBe(before);
  });

  it("leaves every locale file untouched", async () => {
    const dir = await seedProject("types-nondestructive");
    const sourceBefore = await readFile(join(dir, "locales", "en.json"), "utf8");
    const targetBefore = await readFile(join(dir, "locales", "de.json"), "utf8");

    await runVerbatra(consumer, ["types", "--cwd", dir], { env: NO_PROVIDER_KEYS });

    expect(await readFile(join(dir, "locales", "en.json"), "utf8")).toBe(sourceBefore);
    expect(await readFile(join(dir, "locales", "de.json"), "utf8")).toBe(targetBefore);
  });

  it("writes to the path --out names", async () => {
    const dir = await seedProject("types-out");

    const result = await runVerbatra(
      consumer,
      ["types", "--json", "--out", "src/generated/messages.d.ts", "--cwd", dir],
      { env: NO_PROVIDER_KEYS },
    );

    expect(result.exitCode).toBe(0);
    expect(successResult(result.stdout).path).toBe(join(dir, "src", "generated", "messages.d.ts"));
  });

  it("refuses an output path outside the project as a structured boundary error", async () => {
    const dir = await seedProject("types-refuses-out");

    const result = await runVerbatra(
      consumer,
      ["types", "--json", "--out", "../escaped.d.ts", "--cwd", dir],
      { env: NO_PROVIDER_KEYS },
    );

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain("TYPES_OUTPUT_CONFLICT");
  });

  it("refuses to write the declaration over a configured locale file", async () => {
    const dir = await seedProject("types-refuses-locale");

    const result = await runVerbatra(
      consumer,
      ["types", "--json", "--out", "locales/de.json", "--cwd", dir],
      { env: NO_PROVIDER_KEYS },
    );

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain("TYPES_OUTPUT_CONFLICT");
  });
});
