import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  PLAYGROUND_TEMPERATURE_NOTE,
  type PlaygroundOutput,
  playgroundOutputSchema,
} from "../../lib/playground/schema.ts";
import { MODEL } from "./limits.ts";
import type { SourceItem } from "./source.ts";

export interface OutputInput {
  readonly items: readonly SourceItem[];
  readonly languages: readonly string[];
  readonly translations: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly sdkVersion: string;
  readonly generatedAt: Date;
}

export interface AtomicWriteOps {
  writeFile(path: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
}

const nodeWriteOps: AtomicWriteOps = {
  writeFile: (path, data) => writeFile(path, data, { encoding: "utf8", flag: "wx" }),
  rename: (from, to) => rename(from, to),
  remove: (path) => rm(path, { force: true }),
};

function orderedTranslations(input: OutputInput): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const language of input.languages) {
    const values: Record<string, string> = {};
    for (const item of input.items) {
      const value = input.translations[language]?.[item.id];
      if (value !== undefined) {
        values[item.id] = value;
      }
    }
    result[language] = values;
  }
  return result;
}

export function buildOutput(input: OutputInput): PlaygroundOutput {
  return playgroundOutputSchema.parse({
    items: input.items.map((item) =>
      item.sameAllowed === true
        ? { id: item.id, text: item.text, sameAllowed: true }
        : { id: item.id, text: item.text },
    ),
    translations: orderedTranslations(input),
    metadata: {
      sdkVersion: input.sdkVersion,
      provider: "gemini",
      model: MODEL,
      generatedAt: input.generatedAt.toISOString(),
      temperature: PLAYGROUND_TEMPERATURE_NOTE,
    },
  });
}

export function serializeOutput(output: PlaygroundOutput): string {
  return `${JSON.stringify(output, null, 2)}\n`;
}

export function tempPathFor(path: string): string {
  return join(dirname(path), `.${basename(path)}.${process.pid}-${randomUUID()}.tmp`);
}

export async function writeAtomically(
  path: string,
  data: string,
  ops: AtomicWriteOps = nodeWriteOps,
): Promise<void> {
  const temp = tempPathFor(path);
  try {
    await ops.writeFile(temp, data);
    await ops.rename(temp, path);
  } catch (error) {
    await ops.remove(temp);
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export async function readExistingOutput(path: string): Promise<PlaygroundOutput | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (isMissing(error)) {
      return undefined;
    }
    throw error;
  }
  return playgroundOutputSchema.parse(JSON.parse(raw));
}
