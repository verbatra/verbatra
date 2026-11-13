import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HERO_TERMINAL_CHANGED_KEYS, HERO_TERMINAL_SOURCE } from "@/lib/hero-terminal";
import {
  type CodeLine,
  codeLinesText,
  codeLineText,
  LOCK_DEMO_COUNTS,
  LOCK_DEMO_HASHES,
  LOCK_DEMO_PLAYGROUND_IDS,
  lockDemoSourceLines,
  lockDemoTranslationLines,
  lockLines,
  playgroundIdOf,
} from "@/lib/lock-demo";

function fromDisk(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const GENERATED: {
  items: ReadonlyArray<{ id: string; text: string }>;
  translations: Record<string, Record<string, string>>;
  metadata: { model: string; generatedAt: string };
} = JSON.parse(fromDisk("./playground/translations.json"));

function nonGap(lines: ReadonlyArray<CodeLine>): string[] {
  return lines.filter((line) => line.kind !== "gap").map(codeLineText);
}

function gapTotal(lines: ReadonlyArray<CodeLine>): number {
  return lines.reduce((sum, line) => sum + (line.kind === "gap" ? line.count : 0), 0);
}

function entryCount(lines: ReadonlyArray<CodeLine>): number {
  return lines.filter((line) => line.kind === "entry").length;
}

function sourceTree(): string[] {
  const tree: Record<string, Record<string, string>> = {};
  for (const { key, value } of HERO_TERMINAL_SOURCE) {
    const [group = "", leaf = ""] = key.split(".");
    tree[group] = { ...tree[group], [leaf]: value };
  }
  return JSON.stringify(tree, null, 2).split("\n");
}

function isInOrder(shown: ReadonlyArray<string>, whole: ReadonlyArray<string>): boolean {
  let from = 0;
  for (const line of shown) {
    const at = whole.indexOf(line, from);
    if (at < 0) return false;
    from = at + 1;
  }
  return true;
}

describe("codeLinesText", () => {
  const words = {
    gap: (count: number) => `... ${count} more`,
    mark: (mark: string) => `[${mark}]`,
  };

  it("joins the lines with their indentation, a gap in words and a mark after its entry", () => {
    expect(codeLinesText(lockLines(), words).split("\n")).toEqual([
      "{",
      '  "version": 1,',
      '  "locales": {',
      '    "de": {',
      "      ... 4 more",
      `      "cart.total": "${LOCK_DEMO_HASHES["cart.total"]?.after}",`,
      `      "checkout.pay": "${LOCK_DEMO_HASHES["checkout.pay"]?.before}", [stale]`,
      `      "checkout.title": "${LOCK_DEMO_HASHES["checkout.title"]?.before}", [stale]`,
      `      "errors.notFound": "${LOCK_DEMO_HASHES["errors.notFound"]?.after}",`,
      "      ... 6 more",
      "    }",
      "  }",
      "}",
    ]);
  });
});

describe("the lock demo counts", () => {
  it("come from the hero terminal fixture", () => {
    expect(LOCK_DEMO_COUNTS).toEqual({ changed: 2, unchanged: 12, total: 14 });
    expect(HERO_TERMINAL_CHANGED_KEYS).toHaveLength(LOCK_DEMO_COUNTS.changed);
  });
});

describe("the lock demo hashes", () => {
  it("hold sixteen hex characters per key, equal before and after for an unchanged key", () => {
    for (const { key, before } of HERO_TERMINAL_SOURCE) {
      const hashes = LOCK_DEMO_HASHES[key];
      expect(hashes?.after, key).toMatch(/^[0-9a-f]{16}$/);
      expect(hashes?.before, key).toMatch(/^[0-9a-f]{16}$/);
      expect(hashes?.before === hashes?.after, key).toBe(before === undefined);
    }
  });
});

describe("the en.json excerpt", () => {
  const lines = lockDemoSourceLines();

  it("is a subsequence of the pretty-printed nested file, with the same indentation", () => {
    expect(isInOrder(nonGap(lines), sourceTree())).toBe(true);
  });

  it("marks exactly the changed keys and accounts for every key", () => {
    const marked = lines.filter((line) => line.kind === "entry" && line.mark === "changed");
    expect(marked.map((line) => (line.kind === "entry" ? line.key : ""))).toEqual(
      HERO_TERMINAL_CHANGED_KEYS.map((key) => key.split(".")[1]),
    );
    expect(entryCount(lines) + gapTotal(lines)).toBe(LOCK_DEMO_COUNTS.total);
  });

  it("closes every group it opens", () => {
    const opens = lines.filter((line) => line.kind === "open").length;
    const closes = lines.filter((line) => line.kind === "close").length;
    expect(closes).toBe(opens);
  });
});

describe("the lock excerpt", () => {
  const lines = lockLines();

  it("keeps the real file shape: version, locales and the locale object", () => {
    expect(nonGap(lines).slice(0, 4)).toEqual([
      "{",
      '  "version": 1,',
      '  "locales": {',
      '    "de": {',
    ]);
    expect(nonGap(lines).slice(-3)).toEqual(["    }", "  }", "}"]);
  });

  it("lists keys in the sorted order the lock file writes", () => {
    const keys = lines.flatMap((line) => (line.kind === "entry" ? [line.key] : []));
    expect(keys).toEqual([...keys].sort());
  });

  it("marks the changed keys stale, shows their recorded old hash and accounts for every key", () => {
    const stale = lines.flatMap((line) =>
      line.kind === "entry" && line.mark === "stale" ? [line] : [],
    );
    expect(stale.map((line) => line.key).sort()).toEqual([...HERO_TERMINAL_CHANGED_KEYS].sort());
    for (const line of stale) expect(line.value).toBe(LOCK_DEMO_HASHES[line.key]?.before);
    expect(entryCount(lines) + gapTotal(lines)).toBe(LOCK_DEMO_COUNTS.total);
  });

  it("gives every entry a comma while a later key exists, hidden or not", () => {
    const entries = lines.filter((line) => line.kind === "entry");
    expect(entries.every((line) => line.comma)).toBe(true);
  });
});

describe("the changed German values", () => {
  it("name the generator's items for the changed keys", () => {
    expect(Object.keys(LOCK_DEMO_PLAYGROUND_IDS)).toEqual([...HERO_TERMINAL_CHANGED_KEYS]);
  });

  it("use the English text the generator source translates", () => {
    const source = fromDisk("../scripts/playground/source.ts");
    for (const { key, value } of HERO_TERMINAL_SOURCE) {
      const id = LOCK_DEMO_PLAYGROUND_IDS[key];
      if (id === undefined) continue;
      expect(source, key).toContain(`{ id: "${id}", text: "${value}" }`);
    }
  });

  it("read the generated file: the same text and a German value per changed key", () => {
    for (const [key, id] of Object.entries(LOCK_DEMO_PLAYGROUND_IDS)) {
      const text = HERO_TERMINAL_SOURCE.find((row) => row.key === key)?.value;
      expect(GENERATED.items.find((item) => item.id === id)?.text, id).toBe(text);
      expect(GENERATED.translations.de?.[id], id).toBeTruthy();
    }
  });

  it("show those values on nested de.json lines, with the unchanged keys as one gap", () => {
    const lines = lockDemoTranslationLines();
    const shown = lines.flatMap((line) => (line.kind === "entry" ? [line.value] : []));
    expect(shown).toEqual(
      Object.values(LOCK_DEMO_PLAYGROUND_IDS).map((id) => GENERATED.translations.de?.[id]),
    );
    expect(gapTotal(lines)).toBe(LOCK_DEMO_COUNTS.unchanged);
    expect(nonGap(lines)).toContain('  "checkout": {');
  });
});

describe("playgroundIdOf", () => {
  it("maps each changed key to its generated string id", () => {
    expect(HERO_TERMINAL_CHANGED_KEYS.map(playgroundIdOf)).toEqual([
      "checkoutTitle",
      "checkoutPay",
    ]);
  });

  it("throws for a key the demo does not map, naming it", () => {
    expect(() => playgroundIdOf("checkout.unknown")).toThrow(/checkout\.unknown/);
  });
});
