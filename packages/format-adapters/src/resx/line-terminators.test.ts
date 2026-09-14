import type { LocaleResource, TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { createMemoryAdapterFs, type MemoryAdapterFs } from "../test-support.js";
import { createResxAdapter } from "./resx-adapter.js";

const PATH = "Resources.de.resx";

function document(terminator: string, tail = terminator): string {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<root>",
    '  <data name="A" xml:space="preserve">',
    "    <value>old</value>",
    "  </data>",
    "</root>",
  ]
    .join(terminator)
    .concat(tail);
}

function setup(source: string): {
  readonly adapter: ReturnType<typeof createResxAdapter>;
  readonly fs: MemoryAdapterFs;
} {
  const fs = createMemoryAdapterFs({ [PATH]: source });
  return { adapter: createResxAdapter(fs), fs };
}

function resource(entries: readonly TranslationEntry[]): LocaleResource {
  return {
    locale: "de",
    namespace: "Resources",
    format: "resx",
    entries: new Map(entries.map((item) => [item.key, item])),
  };
}

async function cycles(
  source: string,
  count: number,
  seed?: TranslationEntry,
): Promise<readonly string[]> {
  const { adapter, fs } = setup(source);
  const seen: string[] = [];
  if (seed !== undefined) {
    await adapter.write(resource([seed]), PATH);
    seen.push(fs.files.get(PATH) ?? "");
  }
  for (let index = seen.length; index < count; index += 1) {
    const { resource: read } = await adapter.read(PATH, "de");
    await adapter.write(read, PATH);
    seen.push(fs.files.get(PATH) ?? "");
  }
  return seen;
}

function expectStable(seen: readonly string[]): void {
  expect(seen.length).toBeGreaterThanOrEqual(3);
  for (const written of seen.slice(1)) {
    expect(written).toBe(seen[0]);
  }
}

describe("createResxAdapter keeps a document on its own line terminator", () => {
  it("round-trips a CRLF document byte-identically and stays stable over three more writes", async () => {
    const source = document("\r\n");
    const seen = await cycles(source, 4);
    expectStable(seen);
    expect(seen[0]).toBe(source);
    expect(seen[3]).not.toContain("\r\r");
  });

  it("round-trips an LF document byte-identically and never introduces a carriage return", async () => {
    const source = document("\n");
    const seen = await cycles(source, 4);
    expectStable(seen);
    expect(seen[0]).toBe(source);
    expect(seen[3]).not.toContain("\r");
  });

  it("round-trips a classic-Mac CR-only document byte-identically", async () => {
    const source = document("\r");
    const seen = await cycles(source, 4);
    expectStable(seen);
    expect(seen[0]).toBe(source);
    expect(seen[0]).not.toContain("\n");
  });

  it("settles a mixed-terminator document onto CRLF in the body while keeping the original trailing newline", async () => {
    const source = document("\r\n", "\n").replace("  </data>\r\n</root>", "  </data>\n</root>");
    const seen = await cycles(source, 4);
    expectStable(seen);
    expect(seen[0]).not.toBe(source);
    expect(seen[0]).toContain("  </data>\r\n</root>");
    expect(seen[0]?.endsWith("</root>\n")).toBe(true);
    expect(seen[0]).not.toContain("\r\r");
  });
});

describe("createResxAdapter does not grow a value that carries a carriage return", () => {
  it("keeps a CRLF-carrying value at the same byte length across four writes on a CRLF document", async () => {
    const seed: TranslationEntry = {
      key: "A",
      namespace: "Resources",
      value: "line1\r\nline2",
      placeholders: [],
      isPlural: false,
    };
    const seen = await cycles(document("\r\n"), 4, seed);
    expectStable(seen);
    expect(seen[0]).toContain("<value>line1\r\nline2</value>");
    expect(seen[0]).not.toContain("\r\r");
    expect(seen[3]?.length).toBe(seen[0]?.length);
  });

  it("settles a lone carriage return in a value onto the document terminator and holds it there", async () => {
    const seed: TranslationEntry = {
      key: "A",
      namespace: "Resources",
      value: "line1\rline2",
      placeholders: [],
      isPlural: false,
    };
    const seen = await cycles(document("\r\n"), 4, seed);
    expectStable(seen);
    expect(seen[0]).toContain("<value>line1\r\nline2</value>");
  });

  it("normalizes a CRLF-carrying value to LF on an LF document and keeps it there", async () => {
    const seed: TranslationEntry = {
      key: "A",
      namespace: "Resources",
      value: "line1\r\nline2",
      placeholders: [],
      isPlural: false,
    };
    const seen = await cycles(document("\n"), 4, seed);
    expectStable(seen);
    expect(seen[0]).toContain("<value>line1\nline2</value>");
    expect(seen[0]).not.toContain("\r");
  });
});
