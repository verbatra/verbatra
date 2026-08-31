import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { type RecordedProcessOutput, recordPendingRun, recordRun } from "./diagnostics.js";

const e2eDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(e2eDir, ".tarballs.json");

export interface Tarballs {
  sdk: string;
  cli: string;
  studio: string;
}

export async function readTarballs(): Promise<Tarballs> {
  return JSON.parse(await readFile(manifestPath, "utf8")) as Tarballs;
}

export interface Consumer {
  dir: string;
  bin: string;
}

export async function makeConsumer(options: { withStudio?: boolean } = {}): Promise<Consumer> {
  const { sdk, cli, studio } = await readTarballs();
  const dir = await mkdtemp(join(tmpdir(), "verbatra-e2e-consumer-"));
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name: "verbatra-e2e-consumer", version: "0.0.0", private: true }, null, 2),
  );
  const packs = options.withStudio === true ? [sdk, cli, studio] : [sdk, cli];
  await execa("npm", ["install", "--no-audit", "--no-fund", "--no-package-lock", ...packs], {
    cwd: dir,
  });
  return { dir, bin: join(dir, "node_modules", ".bin", "verbatra") };
}

export interface RunResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export async function runVerbatra(
  consumer: Consumer,
  args: string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const timeoutOptions =
    options.timeoutMs === undefined
      ? {}
      : { timeout: options.timeoutMs, killSignal: "SIGKILL" as const };
  const result = await execa(consumer.bin, args, {
    cwd: options.cwd ?? consumer.dir,
    env: { ...process.env, ...options.env },
    reject: false,
    ...timeoutOptions,
  });
  const runResult: RunResult = {
    exitCode: result.exitCode ?? null,
    signal: result.signal ?? null,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  recordRun(commandLabel(args), runResult);
  return runResult;
}

function commandLabel(args: string[]): string {
  return `verbatra ${args.join(" ")}`;
}

export function spawnVerbatra(
  consumer: Consumer,
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
) {
  const subprocess = execa(consumer.bin, args, {
    cwd: options.cwd ?? consumer.dir,
    env: { ...process.env, ...options.env },
    reject: false,
  });
  recordPendingRun(commandLabel(args), async (): Promise<RecordedProcessOutput> => {
    subprocess.kill("SIGKILL");
    const result = await subprocess;
    return {
      exitCode: result.exitCode ?? null,
      signal: result.signal ?? null,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  });
  return subprocess;
}

export type Subprocess = ReturnType<typeof spawnVerbatra>;

export const JSON_ENVELOPE_VERSION = 1;

export interface SuccessEnvelope<TResult> {
  ok: true;
  version: number;
  command: string;
  result: TResult;
}

export interface ErrorEnvelope {
  ok: false;
  version: number;
  command: string | null;
  code: string;
  message: string;
}

export type JsonEnvelope<TResult> = SuccessEnvelope<TResult> | ErrorEnvelope;

export function parseEnvelope<TResult = unknown>(line: string): JsonEnvelope<TResult> {
  return JSON.parse(line) as JsonEnvelope<TResult>;
}

export function parseNdjsonEnvelopes<TResult = unknown>(stdout: string): JsonEnvelope<TResult>[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => parseEnvelope<TResult>(line));
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ENVELOPE_POLL_INTERVAL_MS = 100;

export interface EnvelopeStream<TResult> {
  next(options: { timeoutMs: number }): Promise<JsonEnvelope<TResult>>;
}

export function readEnvelopeStream<TResult = unknown>(
  subprocess: Subprocess,
): EnvelopeStream<TResult> {
  const stdout = subprocess.stdout;
  if (stdout === null) {
    throw new Error("The subprocess was started without a readable stdout.");
  }

  const arrived: JsonEnvelope<TResult>[] = [];
  let handedOut = 0;
  let incompleteLine = "";
  let malformed: Error | undefined;

  stdout.on("data", (chunk: Buffer) => {
    incompleteLine += chunk.toString();
    const lines = incompleteLine.split("\n");
    incompleteLine = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }
      try {
        arrived.push(parseEnvelope<TResult>(trimmed));
      } catch {
        malformed ??= new Error(
          `Expected one --json envelope per stdout line; got ${trimmed.length} characters that are not JSON.`,
        );
      }
    }
  });

  return {
    async next(options: { timeoutMs: number }): Promise<JsonEnvelope<TResult>> {
      const deadline = Date.now() + options.timeoutMs;
      for (;;) {
        if (malformed !== undefined) {
          throw malformed;
        }
        const envelope = arrived[handedOut];
        if (envelope !== undefined) {
          handedOut += 1;
          return envelope;
        }
        if (Date.now() >= deadline) {
          throw new Error(`No --json record arrived within ${options.timeoutMs}ms.`);
        }
        await delay(ENVELOPE_POLL_INTERVAL_MS);
      }
    },
  };
}

export async function pollUntil(
  predicate: () => Promise<boolean> | boolean,
  options: { timeoutMs: number; intervalMs: number },
): Promise<void> {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await delay(options.intervalMs);
  }
  throw new Error(`pollUntil timed out after ${options.timeoutMs}ms`);
}

export async function writeFileIn(
  dir: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  const full = join(dir, relativePath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, contents);
}

export async function writeJsonIn(
  dir: string,
  relativePath: string,
  value: unknown,
): Promise<void> {
  await writeFileIn(dir, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJsonIn<T = unknown>(dir: string, relativePath: string): Promise<T> {
  return JSON.parse(await readFile(join(dir, relativePath), "utf8")) as T;
}

export interface ProviderEnv {
  id: "anthropic" | "openai" | "gemini" | "deepl" | "google-translate";
  envVar: string;
  key: string;
  model?: string;
}

export const PROVIDER_ENV_VARS: Record<ProviderEnv["id"], string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  deepl: "DEEPL_API_KEY",
  "google-translate": "GOOGLE_TRANSLATE_API_KEY",
};

const SCAFFOLD_MODELS: Partial<Record<ProviderEnv["id"], string>> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-5.4-mini",
  gemini: "gemini-2.5-flash",
};

export function providerFromEnv(): ProviderEnv | null {
  const id = (process.env.E2E_PROVIDER ?? "gemini") as ProviderEnv["id"];
  const envVar = PROVIDER_ENV_VARS[id];
  if (!envVar) {
    return null;
  }
  const key = process.env[envVar];
  if (!key) {
    return null;
  }
  const model = SCAFFOLD_MODELS[id];
  return model ? { id, envVar, key, model } : { id, envVar, key };
}

export function providerConfigBlock(provider: { id: ProviderEnv["id"]; model?: string }): string {
  switch (provider.id) {
    case "anthropic":
      return `{ id: "anthropic", options: { model: ${JSON.stringify(provider.model ?? "claude-sonnet-4-6")}, maxTokens: 4096 } }`;
    case "openai":
      return `{ id: "openai", options: { model: ${JSON.stringify(provider.model ?? "gpt-5.4-mini")}, maxOutputTokens: 4096 } }`;
    case "gemini":
      return `{ id: "gemini", options: { model: ${JSON.stringify(provider.model ?? "gemini-2.5-flash")}, maxOutputTokens: 4096 } }`;
    case "deepl":
      return `{ id: "deepl", options: {} }`;
    case "google-translate":
      return `{ id: "google-translate", options: {} }`;
  }
}
