import { describe, expect, it } from "vitest";
import { SHOWCASE_CLI_COMMAND, showcaseRunLines, showcaseSavings } from "@/lib/showcase-cli";
import { runShowcaseScenario, type ShowcaseOutcome, showcaseSeed } from "@/lib/showcase-scenarios";

function docsSource(relative: string): Promise<string> {
  return import("node:fs/promises").then((fs) =>
    fs.readFile(new URL(`../${relative}`, import.meta.url), "utf8"),
  );
}

describe("showcaseRunLines", () => {
  it("opens with the command header and closes with the run tally", () => {
    const lines = showcaseRunLines(showcaseSeed());
    expect(lines).toEqual([
      SHOWCASE_CLI_COMMAND,
      "  de: 0 translated, 4 unchanged",
      "1 succeeded, 0 partial, 0 failed",
    ]);
  });

  it("marks a run partial when one key is written and another withheld", () => {
    const broken = runShowcaseScenario("break");
    const mixed: ShowcaseOutcome = { ...broken, written: ["cart.checkout"] };
    expect(showcaseRunLines(mixed)).toEqual([
      SHOWCASE_CLI_COMMAND,
      "  de: 1 translated, 3 unchanged, 1 integrity-withheld",
      "    integrity-withheld:",
      "      cart.total: placeholder (-{{amount}}, +{{betrag}})",
      "0 succeeded, 1 partial, 0 failed",
    ]);
  });
});

describe("showcaseSavings", () => {
  it("counts the strings a run sends against what a full retranslate sends", () => {
    expect(showcaseSavings(showcaseSeed())).toEqual({ sent: 0, total: 4 });
    expect(showcaseSavings(runShowcaseScenario("edit"))).toEqual({ sent: 1, total: 4 });
    expect(showcaseSavings(runShowcaseScenario("add"))).toEqual({ sent: 1, total: 5 });
    expect(showcaseSavings(runShowcaseScenario("remove"))).toEqual({ sent: 0, total: 3 });
    expect(showcaseSavings(runShowcaseScenario("break"))).toEqual({ sent: 1, total: 4 });
  });
});

describe("the showcase output stays out of the cli and core at runtime", () => {
  it("imports only types from the scenario module, and nothing from the cli", async () => {
    const source = await docsSource("lib/showcase-cli.ts");
    expect(source).not.toMatch(/^import (?!type )[^;]*"\.\/showcase-scenarios"/m);
    expect(source).not.toMatch(/@verbatra\/(cli|core|sdk)|packages\/cli/);
  });

  it("is pinned to the real cli renderer only from the run test", async () => {
    expect(await docsSource("lib/showcase-cli.run.test.ts")).toContain(
      'from "../../../packages/cli/src/render"',
    );
  });
});
