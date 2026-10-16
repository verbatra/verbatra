import { createDefaultRegistry } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { memoryAdapterFs } from "./format-samples-seed.mjs";
import { HERO_DIFF_SOURCE_PANE, HERO_DIFF_TARGET_PANE, splitFilledLine } from "./hero-diff";
import {
  HERO_DIFF_FORMAT,
  HERO_DIFF_SOURCE,
  HERO_DIFF_SOURCE_LOCALE,
  HERO_DIFF_TARGET_FILLED,
  HERO_DIFF_TARGET_LOCALE,
  HERO_DIFF_TARGET_SYNCED,
} from "./hero-diff-seed.mjs";
import { HERO_TERMINAL_NEW_KEYS, HERO_TERMINAL_SYNCED_KEYS } from "./hero-terminal";

function text(lines: ReadonlyArray<{ readonly text: string }>): string {
  return `${lines.map((line) => line.text).join("\n")}\n`;
}

async function reread(file: string, content: string, locale: string) {
  const registry = createDefaultRegistry(memoryAdapterFs(new Map([[file, content]])));
  const resolution = registry.resolve(file, { format: HERO_DIFF_FORMAT });
  if (resolution.status !== "resolved") throw new Error(`no adapter for ${file}`);
  const { resource } = await resolution.adapter.read(file, locale);
  return [...resource.entries.values()].map(({ key, value }) => ({ key, value }));
}

describe("hero diff", () => {
  it("re-parses the English pane through the real next-intl adapter to the seed", async () => {
    const entries = await reread(
      HERO_DIFF_SOURCE_PANE.file,
      text(HERO_DIFF_SOURCE_PANE.lines),
      HERO_DIFF_SOURCE_LOCALE,
    );
    expect(entries).toEqual(HERO_DIFF_SOURCE);
  });

  it("re-parses the German pane to the synced keys plus the filled ones", async () => {
    const entries = await reread(
      HERO_DIFF_TARGET_PANE.file,
      text(HERO_DIFF_TARGET_PANE.lines),
      HERO_DIFF_TARGET_LOCALE,
    );
    expect(entries).toEqual([...HERO_DIFF_TARGET_SYNCED, ...HERO_DIFF_TARGET_FILLED]);
  });

  it("fills exactly the keys the hero terminal reports missing, and syncs only keys it counts", () => {
    expect(HERO_DIFF_TARGET_FILLED.map((entry) => entry.key)).toEqual([...HERO_TERMINAL_NEW_KEYS]);
    for (const { key } of HERO_DIFF_TARGET_SYNCED) expect(HERO_TERMINAL_SYNCED_KEYS).toContain(key);
    expect(HERO_DIFF_SOURCE.map((entry) => entry.key)).toEqual(
      [...HERO_DIFF_TARGET_SYNCED, ...HERO_DIFF_TARGET_FILLED].map((entry) => entry.key),
    );
  });

  it("marks one line per filled key, split so only the value fades", () => {
    const fills = HERO_DIFF_TARGET_PANE.lines.flatMap((line) => (line.fill ? [line.fill] : []));
    expect(fills.map((fill) => fill.key)).toEqual([...HERO_TERMINAL_NEW_KEYS]);
    for (const [index, fill] of fills.entries()) {
      expect(fill.lead.trim()).toBe(`${JSON.stringify(fill.key.split(".").at(-1))}:`);
      expect(fill.value).toContain(JSON.stringify(HERO_DIFF_TARGET_FILLED[index]?.value));
    }
    expect(HERO_DIFF_SOURCE_PANE.lines.every((line) => line.fill === undefined)).toBe(true);
  });

  it("refuses a line that holds no value", () => {
    expect(() => splitFilledLine("checkout", "  },")).toThrow(/holds no value/);
  });
});
