import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFileIn } from "./harness.js";

export const WIRE_LOG_ENV = "VERBATRA_E2E_WIRE_LOG";

export const WIRE_RECORDER_PRELOAD = [
  'import { appendFileSync } from "node:fs";',
  'import https from "node:https";',
  `const logPath = process.env.${WIRE_LOG_ENV};`,
  'const record = (entry) => appendFileSync(logPath, JSON.stringify(entry) + "\\n");',
  "const hostOf = (input) => {",
  '  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;',
  "  return new URL(href).hostname;",
  "};",
  "const originalFetch = globalThis.fetch;",
  "globalThis.fetch = (input, init) => {",
  '  if (hostOf(input) === "translation.googleapis.com" && typeof init?.body === "string") {',
  "    const body = JSON.parse(init.body);",
  '    record({ provider: "google-translate", texts: body.q, format: body.format });',
  "  }",
  "  return originalFetch(input, init);",
  "};",
  "const originalRequest = https.request;",
  "https.request = function (...args) {",
  "  const request = originalRequest.apply(this, args);",
  '  const host = String(request.host ?? "");',
  '  if (!/(^|\\.)deepl\\.com$/.test(host) || !String(request.path ?? "").startsWith("/v2/translate")) {',
  "    return request;",
  "  }",
  "  const chunks = [];",
  "  const collect = (chunk) => {",
  '    if (chunk !== undefined && chunk !== null && typeof chunk !== "function") {',
  "      chunks.push(Buffer.from(chunk));",
  "    }",
  "  };",
  "  const write = request.write;",
  "  request.write = function (chunk, ...rest) {",
  "    collect(chunk);",
  "    return write.call(this, chunk, ...rest);",
  "  };",
  "  const end = request.end;",
  "  request.end = function (chunk, ...rest) {",
  "    collect(chunk);",
  '    record({ provider: "deepl", body: Buffer.concat(chunks).toString("utf8") });',
  "    return end.call(this, chunk, ...rest);",
  "  };",
  "  return request;",
  "};",
  "",
].join("\n");

export type WireRecord =
  | {
      readonly provider: "google-translate";
      readonly texts: readonly string[];
      readonly format: string;
    }
  | { readonly provider: "deepl"; readonly body: string };

export interface WireRecorder {
  readonly env: Record<string, string>;
  readonly logPath: string;
}

export async function prepareWireRecorder(dir: string): Promise<WireRecorder> {
  await writeFileIn(dir, "wire-recorder.mjs", WIRE_RECORDER_PRELOAD);
  const logPath = join(dir, "wire-log.ndjson");
  await writeFileIn(dir, "wire-log.ndjson", "");
  const preload = `--import ${pathToFileURL(join(dir, "wire-recorder.mjs")).href}`;
  const inherited = process.env.NODE_OPTIONS;
  return {
    logPath,
    env: {
      [WIRE_LOG_ENV]: logPath,
      NODE_OPTIONS: inherited ? `${inherited} ${preload}` : preload,
    },
  };
}

export async function readWireRecords(logPath: string): Promise<WireRecord[]> {
  const lines = (await readFile(logPath, "utf8")).split("\n").filter((line) => line.length > 0);
  return lines.map((line) => JSON.parse(line) as WireRecord);
}

export function characterCount(texts: readonly string[]): number {
  return texts.reduce((total, text) => total + [...text].length, 0);
}

const MARKUP_TAG = /<[^<>]*>/g;

export function withoutMarkupTags(texts: readonly string[]): string[] {
  return texts.map((text) => text.replace(MARKUP_TAG, ""));
}

export function deeplTexts(body: string): string[] {
  return new URLSearchParams(body).getAll("text");
}

export function unmaskedDeepLBody(maskedBody: string, sourceValues: readonly string[]): string {
  const masked = new URLSearchParams(maskedBody);
  const unmasked = new URLSearchParams();
  for (const name of ["source_lang", "target_lang"]) {
    const value = masked.get(name);
    if (value !== null) {
      unmasked.set(name, value);
    }
  }
  unmasked.set("show_billed_characters", "1");
  for (const value of sourceValues) {
    unmasked.append("text", value);
  }
  return unmasked.toString();
}

export interface BillingRow {
  readonly provider: string;
  readonly variant: "masked" | "unmasked";
  readonly requests: number;
  readonly texts: readonly string[];
  readonly billedCharacters: string;
}

export function billingTable(rows: readonly BillingRow[]): string {
  const lines = [
    "| Provider | Batch | Requests | Characters sent | Without markup tags | Billed (provider-reported) |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${row.provider} | ${row.variant} | ${row.requests} | ${characterCount(row.texts)} | ${characterCount(withoutMarkupTags(row.texts))} | ${row.billedCharacters} |`,
    ),
  ];
  return lines.join("\n");
}

const DEEPL_FREE_KEY_SUFFIX = ":fx";

function deeplTranslateUrl(key: string): string {
  const host = key.endsWith(DEEPL_FREE_KEY_SUFFIX) ? "api-free.deepl.com" : "api.deepl.com";
  return `https://${host}/v2/translate`;
}

interface DeepLBilledResponse {
  translations?: { billed_characters?: number }[];
}

export async function deeplBilledCharacters(key: string, body: string): Promise<string> {
  const response = await fetch(deeplTranslateUrl(key), {
    method: "POST",
    headers: {
      authorization: `DeepL-Auth-Key ${key}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) {
    return `unavailable (HTTP ${response.status})`;
  }
  const parsed = (await response.json()) as DeepLBilledResponse;
  const billed = (parsed.translations ?? []).map((item) => item.billed_characters);
  if (billed.some((value) => typeof value !== "number")) {
    return "unavailable (no billed_characters in the response)";
  }
  return String(billed.reduce<number>((total, value) => total + (value ?? 0), 0));
}

export async function publishBillingObservation(
  rows: readonly BillingRow[],
  note: string,
): Promise<void> {
  const table = billingTable(rows);
  console.info(`Placeholder-masking billing observation\n${table}\n${note}`);
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    await appendFile(
      summaryPath,
      `\n### Placeholder-masking billing observation\n\n${table}\n\n${note}\n`,
    );
  }
}
