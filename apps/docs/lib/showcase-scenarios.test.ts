import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { flattenJson } from "@/lib/showcase-flatten";
import {
  runShowcaseScenario,
  SEED_LOCK_HASHES,
  type ShowcaseLine,
  showcaseRows,
  showcaseSeed,
} from "@/lib/showcase-scenarios";
import { SHOWCASE_SCENARIOS, showcaseKey } from "@/lib/showcase-seed";

function marked(lines: ReadonlyArray<ShowcaseLine>): ReadonlyArray<readonly [string, string]> {
  return lines.flatMap((line) => (line.mark ? [[line.text.trim(), line.mark] as const] : []));
}

function docsFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

describe("the showcase seed", () => {
  it("starts in sync, with nothing to send and no marked line", () => {
    const seed = showcaseSeed();
    expect(seed.scenario).toBeNull();
    expect(seed.unchanged).toEqual(Object.keys(SEED_LOCK_HASHES).sort());
    expect([...seed.missing, ...seed.stale, ...seed.orphaned, ...seed.written]).toEqual([]);
    expect([...marked(seed.source), ...marked(seed.target), ...marked(seed.lock)]).toEqual([]);
  });

  it("prints each lock hash in full, 16 hex characters like the real lock file", () => {
    const lock = showcaseSeed()
      .lock.map((line) => line.text)
      .join("\n");
    for (const [key, hash] of Object.entries(SEED_LOCK_HASHES)) {
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
      expect(lock).toContain(`"${key}": "${hash}"`);
    }
  });
});

describe("the showcase scenarios", () => {
  it("edit a value: one stale key is sent and its lock hash changes", () => {
    const outcome = runShowcaseScenario("edit");
    expect(outcome.stale).toEqual(["cart.checkout"]);
    expect(outcome.written).toEqual(["cart.checkout"]);
    expect(outcome.lockHashes["cart.checkout"]).not.toBe(SEED_LOCK_HASHES["cart.checkout"]);
    expect(marked(outcome.source)).toEqual([['"checkout": "Go to checkout"', "edited"]]);
    expect(marked(outcome.target)).toEqual([['"checkout": "Zur Kasse"', "stale"]]);
    expect(marked(outcome.lock).map(([, mark]) => mark)).toEqual(["changes"]);
  });

  it("add a key: one missing key is sent and gains a new lock hash", () => {
    const outcome = runShowcaseScenario("add");
    expect(outcome.missing).toEqual(["account.wishlist"]);
    expect(outcome.written).toEqual(["account.wishlist"]);
    expect(Object.keys(outcome.lockHashes)).toContain("account.wishlist");
    expect(marked(outcome.source)).toEqual([['"wishlist": "Your wishlist"', "added"]]);
    expect(marked(outcome.target)).toEqual([['"wishlist": "…"', "missing"]]);
    expect(marked(outcome.lock).map(([, mark]) => mark)).toEqual(["new"]);
  });

  it("remove a key: nothing is sent, and the German value and its lock entry stay", () => {
    const outcome = runShowcaseScenario("remove");
    expect([...outcome.missing, ...outcome.stale, ...outcome.written]).toEqual([]);
    expect(outcome.orphaned).toEqual(["account.orders"]);
    expect(outcome.lockHashes).toEqual(SEED_LOCK_HASHES);
    expect(marked(outcome.source)).toEqual([['"orders": "Your orders"', "removed"]]);
    expect(marked(outcome.target)).toEqual([['"orders": "Deine Bestellungen"', "orphaned"]]);
  });

  it("break a placeholder: the reply is refused, so nothing is written or locked", () => {
    const outcome = runShowcaseScenario("break");
    expect(outcome.stale).toEqual(["cart.total"]);
    expect(outcome.written).toEqual([]);
    expect(outcome.refusal).toEqual({
      key: "cart.total",
      candidate: "Fällig: {{betrag}}",
      details: ["-{{amount}}", "+{{betrag}}"],
    });
    expect(outcome.lockHashes).toEqual(SEED_LOCK_HASHES);
    expect(marked(outcome.lock).map(([, mark]) => mark)).toEqual(["kept"]);
    expect(marked(outcome.target)).toEqual([
      ['"total": "Fällig: {{betrag}}"', "refused"],
      ['"total": "Summe: {{amount}}",', "stale"],
    ]);
  });

  it("reserves as many rows per file as the longest scenario needs", () => {
    const outcomes = [showcaseSeed(), ...SHOWCASE_SCENARIOS.map(runShowcaseScenario)];
    const rows = showcaseRows();
    for (const pane of ["source", "target", "lock"] as const) {
      expect(rows[pane]).toBe(Math.max(...outcomes.map((outcome) => outcome[pane].length)));
    }
  });
});

describe("the showcase copy", () => {
  const CONDITIONAL: Readonly<Record<string, RegExp>> = {
    en: /would translate/,
    de: /würde .* übersetzen/,
    es: /traduciría/,
    fr: /traduirait/,
  };
  const NOTHING_TRANSLATED: Readonly<Record<string, RegExp>> = {
    en: /translates nothing/,
    de: /übersetzt nichts/,
    es: /no traduce nada/,
    fr: /sans rien traduire/,
  };

  it.each(Object.keys(CONDITIONAL))(
    "%s says what verbatra would translate, never that the page translates",
    (locale) => {
      const showcase = JSON.parse(docsFile(`messages/${locale}.json`)).landing.showcase;
      expect(showcase.tryIt.result.headline).toMatch(CONDITIONAL[locale] as RegExp);
      expect(showcase.tryIt.result.seed).toMatch(CONDITIONAL[locale] as RegExp);
      expect(showcase.lead).toMatch(NOTHING_TRANSLATED[locale] as RegExp);
    },
  );
});

describe("the showcase keeps @verbatra/core out of the initial bundle", () => {
  it("the Try it client island never imports the scenario module or core statically", () => {
    const source = docsFile("components/landing/try-it.tsx");
    expect(source).not.toMatch(/^import (?!type )[^;]*"@\/lib\/showcase-scenarios"/m);
    expect(source).not.toContain("@verbatra/core");
  });

  it("loads the scenario module with a dynamic import on interaction", () => {
    expect(docsFile("components/landing/try-it.tsx")).toContain(
      'import("@/lib/showcase-scenarios")',
    );
  });

  it.each(["lib/showcase-seed.ts", "lib/showcase-flatten.ts"])(
    "%s takes nothing from core at runtime",
    (file) => {
      expect(docsFile(file)).not.toMatch(/^import (?!type )[^;]*"@verbatra\/core[^"]*"/m);
    },
  );

  it.each(["lib/showcase-scenarios.ts", "lib/showcase-flatten.ts"])(
    "%s reaches core only through the zod-free pure entry",
    (file) => {
      const specifiers = [...docsFile(file).matchAll(/from "(@verbatra\/core[^"]*)"/g)].map(
        (match) => match[1],
      );
      expect(specifiers.length).toBeGreaterThan(0);
      expect(new Set(specifiers)).toEqual(new Set(["@verbatra/core/pure"]));
    },
  );
});

describe("the showcase keys", () => {
  it("encodes a dotted segment the way the flattener does", () => {
    expect(showcaseKey(["a.b", "c"])).toBe("a\\.b.c");
    expect([...flattenJson({ "a.b": { c: "x" } }, "en").keys()]).toEqual([
      showcaseKey(["a.b", "c"]),
    ]);
  });
});
