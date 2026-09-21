import { Readable } from "node:stream";
import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { buildWorkbook } from "./build-workbook.js";
import { DEFAULT_WORKBOOK_LIMITS } from "./limits.js";
import { expectWorkbookInvalid, row, singleLocaleModel } from "./test-support.js";
import { declaredSize, guardWorkbookBytes, streamEntryBounded } from "./zip-guard.js";

const model = singleLocaleModel([row({ key: "k1", source: "Hello", sourceHash: "h1" })]);

describe("guardWorkbookBytes: reject matrix", () => {
  it("rejects a container whose entry count exceeds maxEntryCount", async () => {
    const zip = new JSZip();
    for (let index = 0; index < 10; index += 1) {
      zip.file(`file${index}.txt`, "x");
    }
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const limits = { ...DEFAULT_WORKBOOK_LIMITS, maxEntryCount: 3 };
    await expectWorkbookInvalid(() => guardWorkbookBytes(bytes, limits));
  });

  it("rejects in the declared-size pass when the summed declared sizes exceed the cap", async () => {
    const zip = new JSZip();
    zip.file("big.txt", "A".repeat(5000));
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const limits = { ...DEFAULT_WORKBOOK_LIMITS, maxDecompressedBytes: 1000 };
    await expectWorkbookInvalid(() => guardWorkbookBytes(bytes, limits));
  });

  it("rejects a part that declares a DTD via DOCTYPE", async () => {
    const zip = new JSZip();
    zip.file("doctype.xml", '<?xml version="1.0"?><!DOCTYPE root><root></root>');
    const bytes = await zip.generateAsync({ type: "uint8array" });
    await expectWorkbookInvalid(() => guardWorkbookBytes(bytes, DEFAULT_WORKBOOK_LIMITS));
  });

  it("rejects a part that declares an entity (XXE defense)", async () => {
    const zip = new JSZip();
    zip.file("entity.xml", '<?xml version="1.0"?><!ENTITY x "y">');
    const bytes = await zip.generateAsync({ type: "uint8array" });
    await expectWorkbookInvalid(() => guardWorkbookBytes(bytes, DEFAULT_WORKBOOK_LIMITS));
  });

  it("rejects bytes that are not a loadable zip container", async () => {
    const bytes = new TextEncoder().encode("this is not a zip container at all");
    await expectWorkbookInvalid(() => guardWorkbookBytes(bytes, DEFAULT_WORKBOOK_LIMITS));
  });

  it("rejects a real high-ratio DEFLATE bomb end to end", async () => {
    const zip = new JSZip();
    zip.file("bomb.bin", "A".repeat(2 * 1024 * 1024));
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const limits = { ...DEFAULT_WORKBOOK_LIMITS, maxDecompressedBytes: 4096 };
    await expectWorkbookInvalid(() => guardWorkbookBytes(bytes, limits));
  });
});

describe("guardWorkbookBytes: accept", () => {
  it("resolves for a well-formed workbook within all caps and free of any DTD or entity", async () => {
    const bytes = await buildWorkbook(model);
    await expect(guardWorkbookBytes(bytes, DEFAULT_WORKBOOK_LIMITS)).resolves.toBeUndefined();
  });

  it("accepts a binary part whose raw decompressed bytes are under the cap even though decoding it as UTF-8 would inflate the byte count past the cap", async () => {
    const raw = new Uint8Array(1000).fill(0xff);
    const zip = new JSZip();
    zip.file("docProps/thumbnail.jpeg", raw);
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
    const limits = { ...DEFAULT_WORKBOOK_LIMITS, maxDecompressedBytes: 2000 };
    await expect(guardWorkbookBytes(bytes, limits)).resolves.toBeUndefined();
  });
});

describe("streamEntryBounded", () => {
  it("aborts before materializing an entry once the running total passes the budget", async () => {
    let pulls = 0;
    async function* gen(): AsyncGenerator<Buffer> {
      for (let index = 0; index < 100_000; index += 1) {
        pulls += 1;
        yield Buffer.alloc(1024, 0x41);
      }
    }
    const stub = { nodeStream: () => Readable.from(gen()) };
    const remaining = 64 * 1024;
    await expectWorkbookInvalid(() => streamEntryBounded(stub, remaining));
    expect(pulls).toBeLessThan(200);
  });

  it("rethrows a stream error as an undecompressable-entry WORKBOOK_INVALID", async () => {
    const stub = {
      nodeStream: () =>
        new Readable({
          read() {
            this.destroy(new Error("corrupt deflate stream"));
          },
        }),
    };
    await expectWorkbookInvalid(() => streamEntryBounded(stub, 64 * 1024));
  });

  it("accumulates string chunks and returns the raw byte count with the decoded UTF-8 content", async () => {
    const stub = { nodeStream: () => Readable.from(["abc", "def"]) };
    await expect(streamEntryBounded(stub, 64 * 1024)).resolves.toEqual({
      raw: 6,
      content: "abcdef",
    });
  });

  it("reports a raw byte count that reflects true decompressed bytes, not the UTF-8 re-encoded decoded string", async () => {
    const invalidUtf8 = Buffer.from([0x80, 0xc2, 0xff, 0xfe]);
    const stub = { nodeStream: () => Readable.from([invalidUtf8]) };
    const result = await streamEntryBounded(stub, 64 * 1024);
    expect(result.raw).toBe(4);
    expect(Buffer.byteLength(result.content, "utf8")).toBeGreaterThan(4);
  });

  it("bounds real JSZip production on a high-ratio DEFLATE entry regardless of its size", async () => {
    const uncompressedBytes = 16 * 1024 * 1024;
    const zip = new JSZip();
    zip.file("bomb.bin", "A".repeat(uncompressedBytes));
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const loaded = await JSZip.loadAsync(bytes);
    const file = Object.values(loaded.files).find((entry) => !entry.dir);
    expect(file).toBeDefined();
    const realFile = file as JSZip.JSZipObject;

    const originalNodeStream = realFile.nodeStream.bind(realFile);
    let producedBytes = 0;
    const spy = vi.spyOn(realFile, "nodeStream").mockImplementation((type?: "nodebuffer") => {
      const stream = originalNodeStream(type);
      stream.on("data", (chunk: Buffer | string) => {
        producedBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
      });
      return stream;
    });

    try {
      await expectWorkbookInvalid(() => streamEntryBounded(realFile, 64 * 1024));
      expect(producedBytes).toBeGreaterThan(0);
      expect(producedBytes).toBeLessThan(1024 * 1024);
      expect(producedBytes).toBeLessThan(uncompressedBytes);
    } finally {
      spy.mockRestore();
    }
  }, 180_000);
});

describe("declaredSize: JSZip internals canary", () => {
  it("returns the known uncompressed size of a good zip so an internals rename fails loudly", async () => {
    const content = "hello canary";
    const zip = new JSZip();
    zip.file("known.txt", content);
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const loaded = await JSZip.loadAsync(bytes);
    const file = loaded.file("known.txt");
    expect(file).not.toBeNull();
    const size = declaredSize(file as JSZip.JSZipObject);
    expect(typeof size).toBe("number");
    expect(size).toBe(Buffer.byteLength(content, "utf8"));
  });

  it("returns undefined when the entry omits or malforms the uncompressed size metadata", () => {
    expect(declaredSize({} as JSZip.JSZipObject)).toBeUndefined();
    expect(
      declaredSize({ _data: { uncompressedSize: "not a number" } } as unknown as JSZip.JSZipObject),
    ).toBeUndefined();
  });
});
