import { basename, extname, join } from "node:path";
import type { VerbatraConfig } from "../../config/schema.js";
import { InputFileError } from "../../errors.js";
import type { SdkFs } from "../../fs.js";
import {
  type DirectoryFormat,
  handoffExtension,
  handoffFamily,
  handoffFileName,
  isXliffFormat,
  isXliffPath,
} from "./exchange-format.js";
import { readExportedLocales } from "./export-manifest.js";

const MAX_HANDOFF_FILE_BYTES = 32 * 1024 * 1024;

export interface HandoffSource {
  readonly locale: string;
  readonly text: string;
}

export interface HandoffFiles {
  readonly sources: readonly HandoffSource[];
  readonly staleLocales: readonly string[];
  readonly expectedLocales: readonly string[];
  readonly singleFile: boolean;
}

async function readHandoffText(path: string, fs: SdkFs): Promise<string | undefined> {
  const read = await fs.readFileBounded(path, MAX_HANDOFF_FILE_BYTES);
  if (read.kind === "missing") {
    return undefined;
  }
  if (read.kind === "too-large") {
    throw new InputFileError(
      "handoff",
      "SOURCE_INVALID",
      `The interchange file at ${path} exceeds the maximum allowed size of ${MAX_HANDOFF_FILE_BYTES} bytes.`,
    );
  }
  return read.content;
}

function describeFiles(format: DirectoryFormat): string {
  return isXliffFormat(format) ? "XLIFF" : format;
}

function singleFileLocale(path: string, format: DirectoryFormat): string {
  return isXliffPath(path)
    ? basename(path, extname(path))
    : basename(path, `.${handoffExtension(format)}`);
}

export async function collectHandoffFiles(
  path: string,
  config: VerbatraConfig,
  fs: SdkFs,
  format: DirectoryFormat,
): Promise<HandoffFiles> {
  const single = await readHandoffText(path, fs);
  if (single !== undefined) {
    const locale = singleFileLocale(path, format);
    return {
      sources: [{ locale, text: single }],
      staleLocales: [],
      expectedLocales: [locale],
      singleFile: true,
    };
  }
  const exported = await readExportedLocales(fs, path, handoffFamily(format));
  const sources: HandoffSource[] = [];
  const staleLocales: string[] = [];
  for (const locale of config.targetLocales) {
    const text = await readHandoffText(join(path, handoffFileName(locale, format)), fs);
    if (text === undefined) {
      continue;
    }
    if (exported !== undefined && !exported.has(locale)) {
      staleLocales.push(locale);
      continue;
    }
    sources.push({ locale, text });
  }
  if (sources.length === 0 && staleLocales.length === 0) {
    throw new InputFileError(
      "handoff",
      "SOURCE_UNREADABLE",
      `No ${describeFiles(format)} file was found at ${path}, and it holds no <locale>.${handoffExtension(format)} file for any configured target locale.`,
    );
  }
  return { sources, staleLocales, expectedLocales: config.targetLocales, singleFile: false };
}
