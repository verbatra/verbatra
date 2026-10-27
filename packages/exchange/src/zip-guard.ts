import { Readable } from "node:stream";
import type JSZip from "jszip";
import { ExchangeError } from "./errors.js";
import type { WorkbookLimits } from "./limits.js";
import { loadJsZip } from "./xlsx-libraries.js";

function assertNoDoctype(name: string, xml: string): void {
  if (/<!DOCTYPE/i.test(xml) || /<!ENTITY/i.test(xml)) {
    throw new ExchangeError(
      "WORKBOOK_INVALID",
      `A workbook XML part (${name}) declares a DTD or entity, which is not permitted.`,
    );
  }
}

export function declaredSize(file: JSZip.JSZipObject): number | undefined {
  const data = (file as { _data?: { uncompressedSize?: unknown } })._data;
  const size = data?.uncompressedSize;
  return typeof size === "number" && Number.isFinite(size) ? size : undefined;
}

interface EntryStreamSource {
  nodeStream(type?: "nodebuffer"): NodeJS.ReadableStream;
}

export interface StreamedEntry {
  readonly raw: number;
  readonly content: string;
}

export async function streamEntryBounded(
  file: EntryStreamSource,
  remaining: number,
): Promise<StreamedEntry> {
  const chunks: Buffer[] = [];
  let raw = 0;
  let oversize = false;
  const source: NodeJS.ReadableStream = new Readable({ objectMode: true }).wrap(
    file.nodeStream("nodebuffer"),
  );
  try {
    for await (const chunk of source) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      raw += buf.length;
      if (raw > remaining) {
        oversize = true;
        break;
      }
      chunks.push(buf);
    }
  } catch {
    throw new ExchangeError("WORKBOOK_INVALID", "A workbook entry could not be decompressed.");
  }
  if (oversize) {
    throw new ExchangeError(
      "WORKBOOK_INVALID",
      "The workbook decompresses to more than the permitted maximum bytes.",
    );
  }
  return { raw, content: Buffer.concat(chunks).toString("utf8") };
}

export async function guardWorkbookBytes(bytes: Uint8Array, limits: WorkbookLimits): Promise<void> {
  let zip: JSZip;
  try {
    zip = await (await loadJsZip()).loadAsync(bytes);
  } catch {
    throw new ExchangeError("WORKBOOK_INVALID", "The workbook is not a readable xlsx container.");
  }

  const files = Object.values(zip.files).filter((file) => !file.dir);
  if (files.length > limits.maxEntryCount) {
    throw new ExchangeError(
      "WORKBOOK_INVALID",
      `The workbook has more than the maximum of ${limits.maxEntryCount} entries.`,
    );
  }

  let declaredTotal = 0;
  for (const file of files) {
    const size = declaredSize(file);
    if (size !== undefined) {
      declaredTotal += size;
      if (declaredTotal > limits.maxDecompressedBytes) {
        throw new ExchangeError(
          "WORKBOOK_INVALID",
          `The workbook decompresses to more than the maximum of ${limits.maxDecompressedBytes} bytes.`,
        );
      }
    }
  }

  let actualTotal = 0;
  for (const file of files) {
    const remaining = limits.maxDecompressedBytes - actualTotal;
    const { raw, content } = await streamEntryBounded(file, remaining);
    actualTotal += raw;
    assertNoDoctype(file.name, content);
  }
}
