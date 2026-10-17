import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const LOCALE_SUFFIXES = ["", ".de", ".es", ".fr"];

function readRepoFile(relativePath) {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

function dataFlowProviderIds() {
  const source = readRepoFile("packages/sdk/src/config/provider-data-flow.ts");
  const table = /export const PROVIDER_DATA_FLOW: ProviderDataFlowTable = \{([\s\S]*?)\n\};/.exec(
    source,
  )?.[1];
  if (table === undefined) {
    throw new Error("PROVIDER_DATA_FLOW could not be located in provider-data-flow.ts");
  }
  return [...table.matchAll(/^ {2}"?([a-z-]+)"?:/gm)].map((match) => match[1]);
}

function tableHolding(page, rowStart) {
  const lines = page.split("\n");
  const index = lines.findIndex((line) => line.startsWith(rowStart));
  if (index === -1) {
    return [];
  }
  let start = index;
  while (start > 0 && lines[start - 1].startsWith("|")) {
    start -= 1;
  }
  let end = index;
  while (end + 1 < lines.length && lines[end + 1].startsWith("|")) {
    end += 1;
  }
  return lines.slice(start, end + 1);
}

function documentedProviderIds(page) {
  return tableHolding(page, "| `deepl` |").flatMap((row) => {
    const firstCell = row.split("|")[1] ?? "";
    return [...firstCell.matchAll(/`([a-z-]+)`/g)].map((match) => match[1]);
  });
}

function dataHandlingPage(suffix) {
  return readRepoFile(`apps/docs/content/docs/(concepts)/data-handling${suffix}.mdx`);
}

describe("the data-handling page lists every provider the data-flow manifest describes", () => {
  const ids = [...dataFlowProviderIds(), "none"];

  it("reads every data-flow entry, so the comparison cannot pass vacuously", () => {
    expect(ids.length).toBeGreaterThanOrEqual(8);
    expect(ids).toContain("anthropic");
    expect(ids).toContain("libretranslate");
  });

  it.each(LOCALE_SUFFIXES)(
    "names each provider once in the provider table of data-handling%s.mdx",
    (suffix) => {
      expect([...documentedProviderIds(dataHandlingPage(suffix))].sort()).toEqual([...ids].sort());
    },
  );

  it.each(LOCALE_SUFFIXES)(
    "tells the reviewer to attach the data-flow manifest in data-handling%s.mdx",
    (suffix) => {
      expect(dataHandlingPage(suffix)).toContain("verbatra doctor --data-flow --json");
    },
  );

  it("sees a provider dropped from the table", () => {
    const page = dataHandlingPage("").replace(/^\| `libretranslate` \|.*\n/m, "");

    expect(documentedProviderIds(page)).not.toContain("libretranslate");
  });
});
