import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { AdapterError } from "../errors.js";
import { MAX_DEPTH } from "../json/limits.js";
import { createYamlAdapter } from "./yaml-adapter.js";

const adapter = createYamlAdapter();

async function tempFile(name: string, content: string): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "verbatra-yaml-")), name);
  await writeFile(path, content);
  return path;
}

async function readError(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((error: unknown) => error);
}

describe("createYamlAdapter detection", () => {
  it("handles .yml and .yaml, not other extensions", () => {
    expect(adapter.canHandle("en.yml")).toBe(true);
    expect(adapter.canHandle("en.yaml")).toBe(true);
    expect(adapter.canHandle("en.json")).toBe(false);
  });

  it("detects by extension only, ignoring any sample", () => {
    expect(adapter.canHandle("en.yml", "not yaml at all")).toBe(true);
  });

  it("reports format yaml", () => {
    expect(adapter.format).toBe("yaml");
  });
});

describe("createYamlAdapter read", () => {
  it("flattens nested YAML and extracts double-brace placeholders", async () => {
    const path = await tempFile("en.yml", "greeting: Hello {{name}}\nnested:\n  title: Welcome\n");
    const { resource, invalidIcuKeys } = await adapter.read(path, "en");
    const greeting = resource.entries.get("greeting");
    expect(greeting?.value).toBe("Hello {{name}}");
    expect(greeting?.placeholders).toEqual(["{{name}}"]);
    expect(greeting?.isPlural).toBe(false);
    expect(resource.entries.get("nested.title")?.value).toBe("Welcome");
    expect(invalidIcuKeys).toEqual([]);
  });

  it("reports malformed YAML as INVALID_YAML", async () => {
    const error = await readError(adapter.read(await tempFile("bad.yml", "a: [unclosed\n"), "en"));
    expect((error as AdapterError).code).toBe("INVALID_YAML");
  });

  it("locates malformed YAML by line and column", async () => {
    const error = await readError(
      adapter.read(await tempFile("colon.yml", "a: ok\nb: [x\nc: - y: z\n"), "en"),
    );
    expect((error as AdapterError).position?.line).toBeGreaterThanOrEqual(2);
    expect((error as AdapterError).message).toMatch(/\(line \d+, column \d+\)\.$/);
  });

  it("rejects a non-object root as INVALID_STRUCTURE", async () => {
    const error = await readError(adapter.read(await tempFile("seq.yml", "- a\n- b\n"), "en"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("accepts a non-string leaf (a YAML number), excluding it instead of rejecting the file", async () => {
    const path = await tempFile("num.yml", "count: 5\ngreeting: Hi\n");
    const { resource, excludedLeafPaths } = await adapter.read(path, "en");
    expect([...resource.entries.keys()]).toEqual(["greeting"]);
    expect(excludedLeafPaths).toEqual(["count"]);
  });

  it("rejects nesting beyond the depth cap as MAX_DEPTH_EXCEEDED", async () => {
    let value = "v";
    for (let i = 0; i < MAX_DEPTH + 1; i += 1) {
      value = `{k: ${value}}`;
    }
    const error = await readError(
      adapter.read(await tempFile("deep.yml", `root: ${value}\n`), "en"),
    );
    expect((error as AdapterError).code).toBe("MAX_DEPTH_EXCEEDED");
  });

  it("bounds anchor-alias expansion (billion-laughs is rejected, not expanded)", async () => {
    const bomb = [
      "a: &a hello",
      "b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]",
      "c: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]",
      "d: [*c, *c, *c, *c, *c, *c, *c, *c, *c, *c]",
      "",
    ].join("\n");
    const error = await readError(adapter.read(await tempFile("bomb.yml", bomb), "en"));
    expect(error).toBeInstanceOf(AdapterError);
  });

  it("stringifies a scalar non-string key, matching the previous plain-object behavior", async () => {
    const path = await tempFile("keys.yml", "1: one\ntrue: yes-value\n");
    const { resource } = await adapter.read(path, "en");
    expect([...resource.entries.keys()]).toEqual(["1", "true"]);
    expect(resource.entries.get("1")?.value).toBe("one");
  });

  it("rejects a composite mapping key (map or sequence as key) as INVALID_STRUCTURE", async () => {
    for (const doc of ["? [a, b]\n: value\n", "? {k: v}\n: value\n"]) {
      const error = await readError(adapter.read(await tempFile("composite.yml", doc), "en"));
      expect(error).toBeInstanceOf(AdapterError);
      expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    }
  });

  it("rejects a nested composite mapping key too, never writing back an object stringification", async () => {
    const error = await readError(
      adapter.read(await tempFile("nested-composite.yml", "outer:\n  ? [a]\n  : value\n"), "en"),
    );
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });
});

describe("createYamlAdapter write (round-trip)", () => {
  it("writes nested YAML that reparses to the same structure", async () => {
    const path = await tempFile("en.yml", "greeting: Hello\nnested:\n  title: Welcome\n");
    const { resource } = await adapter.read(path, "en");
    await adapter.write(resource, path);
    const written = await readFile(path, "utf8");
    expect(parseYaml(written)).toEqual({ greeting: "Hello", nested: { title: "Welcome" } });
  });

  it("round-trips mixed integer-like and named keys in document order at every level", async () => {
    const original = 'b: B\n"10": ten\n"2": two\nnested:\n  "404": nf\n  a: A\n  "200": ok\n';
    const path = await tempFile("order.yml", original);
    const { resource } = await adapter.read(path, "en");
    expect([...resource.entries.keys()]).toEqual([
      "b",
      "10",
      "2",
      "nested.404",
      "nested.a",
      "nested.200",
    ]);
    await adapter.write(resource, path);
    expect(await readFile(path, "utf8")).toBe(original);
  });
});

describe("createYamlAdapter single-brace fabrication guard", () => {
  it("rejects a single-brace token the source never had", () => {
    expect(adapter.comparePlaceholders?.("Order {orderId}", "Ordine {evil}")).toMatchObject({
      matches: false,
      extra: ["{evil}"],
    });
  });

  it("keeps the double-brace comparison and the dropped-literal allowance", () => {
    expect(adapter.comparePlaceholders?.("hello {{value}}", "ciao {{value}}")).toMatchObject({
      matches: true,
    });
    expect(adapter.comparePlaceholders?.("hello {{value}}", "ciao")).toMatchObject({
      matches: false,
      missing: ["{{value}}"],
    });
    expect(adapter.comparePlaceholders?.("You have {count} items", "Hai articoli")).toMatchObject({
      matches: true,
    });
  });
});
