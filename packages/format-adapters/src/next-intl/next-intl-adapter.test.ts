import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultRegistry } from "../default-registry.js";
import { MAX_DEPTH, MAX_INPUT_BYTES } from "../json/limits.js";
import { createNextIntlJsonAdapter } from "./next-intl-adapter.js";

const adapter = createNextIntlJsonAdapter();

async function tempFile(name: string, content: string | Uint8Array): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "verbatra-next-"));
  const path = join(dir, name);
  await writeFile(path, content);
  return path;
}

describe("next-intl adapter: format and registry", () => {
  it("declares the next-intl-json format", () => {
    expect(adapter.format).toBe("next-intl-json");
  });

  it("is resolved from the default registry by explicit format", () => {
    const result = createDefaultRegistry().resolve("en.json", { format: "next-intl-json" });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.adapter.format).toBe("next-intl-json");
    }
  });

  it("exposes ICU-aware placeholder extraction on the interface", () => {
    expect(adapter.extractPlaceholders("{a} <b>x</b> {c, plural, other {#}}")).toEqual([
      "{a}",
      "<b>",
      "{c}",
    ]);
  });

  it("validateMessage delegates to the ICU analyzer (valid true, malformed false)", () => {
    expect(adapter.validateMessage("Hello {name}")).toBe(true);
    expect(adapter.validateMessage("{count, plural, one {# item} other {# items}}")).toBe(true);
    expect(adapter.validateMessage("{count, plural, one {x")).toBe(false);
  });

  it("exposes the ICU branch-arm check, holding a plural to the target language's categories", () => {
    const source = "{count, plural, one {# item} other {# items}}";
    const russianShape = "{count, plural, one {# x} few {# x} many {# x} other {# x}}";
    const russian = () => ["one", "few", "many", "other"] as const;
    expect(adapter.compareBranchArms?.(source, russianShape, russian)).toEqual([]);
    expect(adapter.compareBranchArms?.(source, source, russian)).toHaveLength(2);
  });

  it("exposes branch-aware comparePlaceholders, catching a single-branch invention flat extraction misses", () => {
    const source = "{count, plural, one {# item} other {# items}}";
    const invented = "{count, plural, one {# item} other {# items by {author}}}";
    expect(adapter.comparePlaceholders?.(source, invented).matches).toBe(false);
    expect(adapter.comparePlaceholders?.(source, invented).extra).toEqual(["{author}"]);
  });
});

describe("next-intl adapter: read", () => {
  it("reads nested ICU values into entries with arguments and isPlural", async () => {
    const path = await tempFile(
      "common.json",
      '{"nav":{"items":"{count, plural, one {# item} other {# items}}"}}',
    );
    const { resource, invalidIcuKeys } = await adapter.read(path, "en");
    expect(resource.namespace).toBe("common");
    const entry = resource.entries.get("nav.items");
    expect(entry?.value).toBe("{count, plural, one {# item} other {# items}}");
    expect(entry?.placeholders).toEqual(["{count}"]);
    expect(entry?.isPlural).toBe(true);
    expect(invalidIcuKeys).toEqual([]);
  });

  it("extracts a simple arg and a tag, keeping isPlural false", async () => {
    const path = await tempFile("c.json", '{"hi":"Hello {name}","rich":"see <link>here</link>"}');
    const { resource } = await adapter.read(path, "en");
    expect(resource.entries.get("hi")?.placeholders).toEqual(["{name}"]);
    expect(resource.entries.get("hi")?.isPlural).toBe(false);
    expect(resource.entries.get("rich")?.placeholders).toEqual(["<link>"]);
  });

  it("lists keys with invalid ICU and keeps their value verbatim; valid keys not listed", async () => {
    const path = await tempFile("c.json", '{"ok":"Hello {name}","bad":"{count, plural, one {x"}');
    const { resource, invalidIcuKeys } = await adapter.read(path, "en");
    expect(invalidIcuKeys).toEqual(["bad"]);
    expect(resource.entries.get("bad")?.value).toBe("{count, plural, one {x");
  });

  it("rejects malformed JSON with a structured error", async () => {
    const path = await tempFile("bad.json", "{ not json");
    await expect(adapter.read(path, "en")).rejects.toMatchObject({
      name: "AdapterError",
      code: "INVALID_JSON",
    });
  });

  it("neutralizes prototype-pollution attempts via hostile keys", async () => {
    const path = await tempFile("evil.json", '{"__proto__":{"polluted":"yes"},"a":"b"}');
    const { resource } = await adapter.read(path, "en");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(resource.entries.get("a")?.value).toBe("b");
  });
});

describe("next-intl adapter: round-trip", () => {
  const original = [
    "{",
    '  "greeting": "Hello {name}",',
    '  "items": "{count, plural, one {# item} other {# items}}",',
    '  "gender": "{g, select, male {Mr} female {Ms} other {Mx}}",',
    '  "rich": "Click <link>here</link>"',
    "}",
    "",
  ].join("\n");

  it("round-trips ICU values byte-for-byte with no reformatting of the body", async () => {
    const inPath = await tempFile("common.json", original);
    const { resource } = await adapter.read(inPath, "en");
    const outPath = await tempFile("out.json", "");
    await adapter.write(resource, outPath);
    expect(await readFile(outPath, "utf8")).toBe(original);
  });

  it("is deterministic across reads", async () => {
    const inPath = await tempFile("common.json", original);
    const r1 = await adapter.read(inPath, "en");
    const r2 = await adapter.read(inPath, "en");
    expect([...r1.resource.entries]).toEqual([...r2.resource.entries]);
    expect(r1.invalidIcuKeys).toEqual(r2.invalidIcuKeys);
  });
});

describe("next-intl adapter: carryover bounds", () => {
  it("rejects over-deep nesting with a structured error", async () => {
    const depth = MAX_DEPTH + 25;
    const content = `${'{"a":'.repeat(depth)}"x"${"}".repeat(depth)}`;
    const path = await tempFile("deep.json", content);
    const error = await adapter.read(path, "en").catch((e: unknown) => e);
    expect((error as { code?: string }).code).toBe("MAX_DEPTH_EXCEEDED");
  });

  it("rejects oversized input with INPUT_TOO_LARGE", async () => {
    const path = await tempFile("big.json", new Uint8Array(MAX_INPUT_BYTES + 1));
    const error = await adapter.read(path, "en").catch((e: unknown) => e);
    expect((error as { code?: string }).code).toBe("INPUT_TOO_LARGE");
  });
});
