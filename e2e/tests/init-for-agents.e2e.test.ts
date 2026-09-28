import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  parseEnvelope,
  readSharedConsumer,
  runVerbatra,
  writeFileIn,
} from "../src/harness.js";

interface InitJson {
  configPath: string;
  files: { path: string; action: string }[];
  config: {
    sourceLocale: string;
    targetLocales: string[];
    format: string;
    files: { pattern: string; localeStyle?: string };
  };
  detection: { format: { id: string; from: string } | null; confidence: string };
  agent: { instructionsFile: string; mcpServer: string } | null;
  nextSteps: { description: string; command: string | null }[];
}

interface DoctorJson {
  ok: boolean;
  checks: { id: string; status: string }[];
}

const PLACEHOLDER_KEYS: Record<string, string> = {
  GEMINI_API_KEY: "e2e-placeholder-never-sent",
  DEEPL_API_KEY: "e2e-placeholder-never-sent",
};

let consumer: Consumer;

beforeAll(async () => {
  consumer = await readSharedConsumer();
}, 180_000);

function successResult<TResult>(stdout: string, command: string): TResult {
  const envelope = parseEnvelope<TResult>(stdout);
  if (!envelope.ok) {
    throw new Error(`Expected a ${command} success envelope, got [${envelope.code}]`);
  }
  expect(envelope.command).toBe(command);
  return envelope.result;
}

async function projectDir(name: string): Promise<string> {
  const dir = join(consumer.dir, name);
  await mkdir(dir, { recursive: true });
  return dir;
}

describe("init for agents (no provider call)", () => {
  it("scaffolds from flags alone into a config doctor passes without a hand edit", async () => {
    const dir = await projectDir("init-agents-flags");
    await writeFileIn(dir, "i18n/en.yml", "greeting: Hello\n");
    const run = (args: string[]) =>
      runVerbatra(consumer, [...args, "--cwd", dir], { env: PLACEHOLDER_KEYS });

    const init = await run([
      "init",
      "--provider",
      "gemini",
      "--format",
      "yaml",
      "--path",
      "i18n/{locale}.yml",
      "--yes",
      "--json",
    ]);
    expect(init.exitCode).toBe(0);
    const result = successResult<InitJson>(init.stdout, "init");
    expect(result.config).toMatchObject({
      format: "yaml",
      files: { pattern: "i18n/{locale}.yml" },
    });
    expect(result.files.map((file) => file.path)).toEqual([
      "verbatra.config.ts",
      ".env.example",
      ".gitignore",
    ]);
    expect(await readFile(join(dir, ".env.example"), "utf8")).not.toContain(
      PLACEHOLDER_KEYS.GEMINI_API_KEY,
    );

    const doctor = await run(["doctor", "--json"]);
    expect(doctor.exitCode).toBe(0);
    const report = successResult<DoctorJson>(doctor.stdout, "doctor");
    expect(report.checks.filter((check) => check.status === "fail")).toEqual([]);
  });

  it("detects an existing YAML layout and refuses to overwrite the config it wrote", async () => {
    const dir = await projectDir("init-agents-detect");
    await writeFileIn(dir, "config/locales/en.yml", "greeting: Hello\n");
    await writeFileIn(dir, "config/locales/de.yml", "greeting: Hallo\n");
    const run = (args: string[]) =>
      runVerbatra(consumer, [...args, "--cwd", dir], { env: PLACEHOLDER_KEYS });

    const init = await run(["init", "--provider", "deepl", "--json"]);
    expect(init.exitCode).toBe(0);
    const result = successResult<InitJson>(init.stdout, "init");
    expect(result.config).toMatchObject({
      sourceLocale: "en",
      targetLocales: ["de"],
      format: "yaml",
      files: { pattern: "config/locales/{locale}.yml" },
    });
    expect(result.detection.format).toEqual({ id: "yaml", from: "files" });

    const doctor = await run(["doctor", "--json"]);
    expect(doctor.exitCode).toBe(0);

    const again = await run(["init", "--provider", "gemini", "--json"]);
    expect(again.exitCode).toBe(2);
    expect(parseEnvelope(again.stdout)).toMatchObject({ ok: false, code: "CONFIG_EXISTS" });
  });

  it("exits 2 with the candidates when plain JSON files fit several formats", async () => {
    const dir = await projectDir("init-agents-ambiguous");
    await writeFileIn(dir, "locales/en.json", '{"greeting":"Hello"}');
    await writeFileIn(dir, "locales/de.json", '{"greeting":"Hallo"}');

    const init = await runVerbatra(consumer, [
      "init",
      "--provider",
      "deepl",
      "--yes",
      "--json",
      "--cwd",
      dir,
    ]);
    expect(init.exitCode).toBe(2);
    expect(parseEnvelope(init.stdout)).toMatchObject({
      ok: false,
      command: "init",
      code: "FORMAT_AMBIGUOUS",
      candidates: ["i18next-json", "vue-i18n-json", "next-intl-json", "ngx-translate-json"],
    });
  });

  it("exits 2 with MISSING_OPTIONS instead of prompting when no provider is given", async () => {
    const dir = await projectDir("init-agents-missing");
    const init = await runVerbatra(consumer, ["init", "--yes", "--json", "--cwd", dir]);

    expect(init.exitCode).toBe(2);
    expect(parseEnvelope(init.stdout)).toMatchObject({ ok: false, code: "MISSING_OPTIONS" });
  });

  it("sets up coding agents with --agent and leaves every file byte-identical on a rerun", async () => {
    const dir = await projectDir("init-agents-scaffold");
    await writeFileIn(dir, "locales/en.json", '{"greeting":"Hello"}');
    await writeFileIn(dir, "CLAUDE.md", "# House rules\n\nKeep it short.\n");
    await writeFileIn(
      dir,
      ".mcp.json",
      `${JSON.stringify({ mcpServers: { other: { command: "other-server" } } }, null, 2)}\n`,
    );
    const args = [
      "init",
      "--provider",
      "gemini",
      "--format",
      "i18next-json",
      "--yes",
      "--agent",
      "--json",
      "--cwd",
      dir,
    ];
    const names = ["CLAUDE.md", ".mcp.json", "verbatra.config.ts", ".env.example", ".gitignore"];
    const read = () => Promise.all(names.map((name) => readFile(join(dir, name), "utf8")));

    const first = await runVerbatra(consumer, args, { env: PLACEHOLDER_KEYS });
    expect(first.exitCode).toBe(0);
    const created = successResult<InitJson>(first.stdout, "init");
    expect(created.agent).toEqual({ instructionsFile: "CLAUDE.md", mcpServer: "added" });
    expect(created.files).toContainEqual({ path: "CLAUDE.md", action: "updated" });
    expect(created.files).toContainEqual({ path: ".mcp.json", action: "updated" });
    const [claude, mcp] = await read();
    expect(claude).toMatch(
      /^# House rules\n\nKeep it short\.\n\n<!-- verbatra:start -->\n## verbatra \(i18n\)\n[\s\S]*<!-- verbatra:end -->\n$/,
    );
    expect(JSON.parse(mcp ?? "")).toEqual({
      mcpServers: {
        other: { command: "other-server" },
        verbatra: { type: "stdio", command: "npx", args: ["-y", "@verbatra/mcp"] },
      },
    });
    const written = await read();
    for (const content of written) {
      expect(content).not.toContain(PLACEHOLDER_KEYS.GEMINI_API_KEY);
    }

    const second = await runVerbatra(consumer, args, { env: PLACEHOLDER_KEYS });
    expect(second.exitCode).toBe(0);
    const again = successResult<InitJson>(second.stdout, "init");
    expect(again.agent).toEqual({ instructionsFile: "CLAUDE.md", mcpServer: "present" });
    expect(again.files.map((file) => file.action)).toEqual(names.map(() => "unchanged"));
    expect(await read()).toEqual(written);
  });

  it("exits 2 with AGENT_FILE_INVALID and writes nothing when .mcp.json is malformed", async () => {
    const dir = await projectDir("init-agents-malformed-mcp");
    await writeFileIn(dir, ".mcp.json", "{ not json");
    const init = await runVerbatra(consumer, [
      "init",
      "--provider",
      "none",
      "--yes",
      "--agent",
      "--json",
      "--cwd",
      dir,
    ]);

    expect(init.exitCode).toBe(2);
    expect(parseEnvelope(init.stdout)).toMatchObject({ ok: false, code: "AGENT_FILE_INVALID" });
    expect(await readFile(join(dir, ".mcp.json"), "utf8")).toBe("{ not json");
  });
});
