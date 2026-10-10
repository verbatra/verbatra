import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeFileIn } from "./harness.js";

const WIRE_LOG_ENV = "VERBATRA_E2E_WIRE_LOG";

export const WIRE_RECORDER_PATH = fileURLToPath(new URL("./wire-recorder.mjs", import.meta.url));

export type WireRecord =
  | {
      readonly provider: "google-translate";
      readonly kind: "request";
      readonly texts: readonly string[];
      readonly format: string;
    }
  | {
      readonly provider: "deepl";
      readonly kind: "request";
      readonly exchange: number;
      readonly body: string;
    }
  | {
      readonly provider: "deepl";
      readonly kind: "response";
      readonly exchange: number;
      readonly status: number;
      readonly billedCharacters: readonly number[] | null;
    }
  | { readonly provider: "unknown"; readonly kind: "unrecorded" };

export interface WireRecorder {
  readonly env: Record<string, string>;
  readonly logPath: string;
}

export async function prepareWireRecorder(dir: string): Promise<WireRecorder> {
  const logPath = join(dir, "wire-log.ndjson");
  await writeFileIn(dir, "wire-log.ndjson", "");
  const preload = `--import ${pathToFileURL(WIRE_RECORDER_PATH).href}`;
  const inherited = process.env.NODE_OPTIONS;
  return {
    logPath,
    env: {
      [WIRE_LOG_ENV]: logPath,
      NODE_OPTIONS: inherited ? `${inherited} ${preload}` : preload,
    },
  };
}

export async function readWireLog(logPath: string): Promise<string> {
  return readFile(logPath, "utf8");
}

export function parseWireLog(log: string): WireRecord[] {
  const lines = log.split("\n").filter((line) => line.length > 0);
  return lines.map((line) => JSON.parse(line) as WireRecord);
}

export function characterCount(texts: readonly string[]): number {
  return texts.reduce((total, text) => total + [...text].length, 0);
}

function textOutsideMarkupTags(text: string): string {
  let kept = "";
  let insideTag = false;
  for (const character of text) {
    if (character === "<") {
      insideTag = true;
    } else if (insideTag) {
      insideTag = character !== ">";
    } else {
      kept += character;
    }
  }
  return kept;
}

export function withoutMarkupTags(texts: readonly string[]): string[] {
  return texts.map(textOutsideMarkupTags);
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

function transportFailure(error: unknown): string {
  return `unavailable (${error instanceof Error ? error.name : "unknown error"})`;
}

export interface DeepLExchange {
  readonly body: string;
  readonly billedCharacters: readonly number[] | null;
}

const HTTP_SUCCESS_MIN = 200;
const HTTP_SUCCESS_MAX = 299;

export function successfulDeepLExchanges(records: readonly WireRecord[]): DeepLExchange[] {
  const bodies = new Map<number, string>();
  const exchanges: DeepLExchange[] = [];
  for (const record of records) {
    if (record.provider !== "deepl") {
      continue;
    }
    if (record.kind === "request") {
      bodies.set(record.exchange, record.body);
      continue;
    }
    const body = bodies.get(record.exchange);
    const succeeded = record.status >= HTTP_SUCCESS_MIN && record.status <= HTTP_SUCCESS_MAX;
    if (body !== undefined && succeeded) {
      exchanges.push({ body, billedCharacters: record.billedCharacters });
    }
  }
  return exchanges;
}

export function sumBilled(billed: readonly (readonly number[] | null)[]): string {
  if (billed.length === 0 || billed.some((values) => values === null)) {
    return "unavailable (no billed_characters recorded)";
  }
  return String(billed.flat().reduce<number>((total, value) => total + (value ?? 0), 0));
}

export async function deeplBilledCharacters(key: string, body: string): Promise<string> {
  try {
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
    return sumBilled([billed.every((value) => typeof value === "number") ? billed : null]);
  } catch (error) {
    return transportFailure(error);
  }
}

export const GOOGLE_TRANSLATE_URL = "https://translation.googleapis.com/language/translate/v2";

export interface UnmaskedGoogleBatch {
  readonly texts: readonly string[];
  readonly source: string;
  readonly target: string;
}

export async function sendUnmaskedGoogleBatch(
  key: string,
  batch: UnmaskedGoogleBatch,
): Promise<string> {
  try {
    const response = await fetch(`${GOOGLE_TRANSLATE_URL}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        q: batch.texts,
        source: batch.source,
        target: batch.target,
        format: "text",
      }),
    });
    return response.ok ? "sent" : `unavailable (HTTP ${response.status})`;
  } catch (error) {
    return transportFailure(error);
  }
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
