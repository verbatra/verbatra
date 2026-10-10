import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultRegistry, type FormatAdapter } from "@verbatra/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { flattenJson } from "@/lib/showcase-flatten";
import {
  applyShowcaseChange,
  type JsonTree,
  SHOWCASE_CHANGES,
  SHOWCASE_SCENARIOS,
  SHOWCASE_SOURCE,
  SHOWCASE_TARGET,
} from "@/lib/showcase-seed";

function fixture(locale: string): JsonTree {
  const path = fileURLToPath(
    new URL(`../scripts/studio-fixture/locales/${locale}.json`, import.meta.url),
  );
  return JSON.parse(readFileSync(path, "utf8")) as JsonTree;
}

const EDGE_TREE: JsonTree = {
  inbox: {
    count_one: "{{count}} message",
    count_other: "{{count}} messages",
    greeting: "Hello {{name}}, see $t(inbox.title)",
    "dotted.key": "A literal dotted key",
    "back\\slash": "A key with a backslash",
  },
  title: "{{a}}{{b}} {{a}}",
};

const TREES: ReadonlyArray<readonly [string, JsonTree]> = [
  ["seed source", SHOWCASE_SOURCE],
  ["seed target", SHOWCASE_TARGET],
  ...SHOWCASE_SCENARIOS.map(
    (id) => [`${id} source`, applyShowcaseChange(SHOWCASE_SOURCE, SHOWCASE_CHANGES[id])] as const,
  ),
  ["studio fixture en", fixture("en")],
  ["studio fixture de", fixture("de")],
  ["edge cases", EDGE_TREE],
];

let cwd = "";
let adapter: FormatAdapter;

beforeAll(async () => {
  cwd = await mkdtemp(join(tmpdir(), "verbatra-docs-flatten-"));
  const resolution = createDefaultRegistry().resolve(join(cwd, "de.json"), {
    format: "i18next-json",
  });
  if (resolution.status !== "resolved") throw new Error("the i18next adapter did not resolve");
  adapter = resolution.adapter;
});

afterAll(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe("the showcase flattener matches the real i18next adapter", () => {
  it.each(TREES)("reads %s into the same entries", async (_, tree) => {
    const file = join(cwd, "de.json");
    await writeFile(file, JSON.stringify(tree));
    const { resource } = await adapter.read(file, "de");
    const ours = flattenJson(tree, resource.namespace);
    expect([...ours.keys()]).toEqual([...resource.entries.keys()]);
    expect(Object.fromEntries(ours)).toEqual(Object.fromEntries(resource.entries));
  });
});
