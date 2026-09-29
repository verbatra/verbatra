import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const LOCALE_SUFFIXES = ["", ".de", ".es", ".fr"];

function readRepoFile(relativePath) {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

function readDocPage(prefix, suffix) {
  return readRepoFile(`apps/docs/content/docs/${prefix}${suffix}.mdx`);
}

function outsideCodeFences(page) {
  const lines = [];
  let fenced = false;
  for (const line of page.split("\n")) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
    } else if (!fenced) {
      lines.push(line);
    }
  }
  return lines;
}

function tableAt(lines, start) {
  const rows = [];
  for (const line of lines.slice(start)) {
    if (!line.startsWith("|")) {
      break;
    }
    rows.push(line);
  }
  return rows;
}

function tableStartingWith(page, isFirstRow) {
  const lines = outsideCodeFences(page);
  const start = lines.findIndex(isFirstRow);
  return start === -1 ? [] : tableAt(lines, start);
}

function firstCell(row) {
  return row.split(" | ")[0].replace(/^\| /, "");
}

function codeSpans(text) {
  return [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function supportedFormats() {
  const source = readRepoFile("packages/core/src/model/supported-format.ts");
  const list = /export const SUPPORTED_FORMATS = \[([\s\S]*?)\] as const;/.exec(source)?.[1];
  if (list === undefined) {
    throw new Error("SUPPORTED_FORMATS could not be located in supported-format.ts");
  }
  return [...list.matchAll(/"([a-z0-9-]+)"/g)].map((match) => match[1]);
}

function registeredAdapterCount() {
  const source = readRepoFile("packages/format-adapters/src/default-registry.ts");
  return [...source.matchAll(/^\s+\.register\(create\w+Adapter\(fs\)\)/gm)].length;
}

function formatOverviewIds(page) {
  const table = tableStartingWith(page, (line) => line.startsWith("|"));
  return table.slice(2).map((row) => codeSpans(firstCell(row))[0]);
}

describe("the formats page lists every built-in format", () => {
  const formats = supportedFormats();

  it("reads the closed format set and one registered adapter per member", () => {
    expect(formats.length).toBeGreaterThanOrEqual(10);
    expect(formats).toContain("i18next-json");
    expect(registeredAdapterCount()).toBe(formats.length);
  });

  it.each(LOCALE_SUFFIXES)(
    "opens formats%s.mdx with one overview row per format id, in order",
    (suffix) => {
      expect(formatOverviewIds(readDocPage("(configure)/formats", suffix))).toEqual(formats);
    },
  );

  it("sees a format missing from the overview table", () => {
    const page = readDocPage("(configure)/formats", "").replace(/^\| `ini` \|.*\n/m, "");

    expect(formatOverviewIds(page)).not.toContain("ini");
  });
});

function providerIds() {
  const source = readRepoFile("packages/sdk/src/config/provider-config.ts");
  const table = /const providerFactories: ProviderFactories = \{([\s\S]*?)\n\};/.exec(source)?.[1];
  if (table === undefined) {
    throw new Error("providerFactories could not be located in provider-config.ts");
  }
  const ids = [...table.matchAll(/^ {2}"?([a-z-]+)"?:/gm)].map((match) => match[1]);
  return [...ids, "none"];
}

function providerSectionIds(page) {
  const sections = page.split(/^## /m).slice(1);
  return sections
    .map((section) => /\bid: "([a-z-]+)"/.exec(section.split(/^### /m)[0])?.[1])
    .filter((id) => id !== undefined);
}

describe("the providers page has one section per provider", () => {
  const ids = providerIds();

  it("reads every factory id plus none", () => {
    expect(ids.length).toBeGreaterThanOrEqual(6);
    expect(ids).toContain("anthropic");
    expect(ids).toContain("libretranslate");
    expect(ids.at(-1)).toBe("none");
  });

  it.each(LOCALE_SUFFIXES)(
    "opens exactly one section per provider id in providers%s.mdx",
    (suffix) => {
      const sectionIds = providerSectionIds(readDocPage("(configure)/providers", suffix));

      expect([...sectionIds].sort()).toEqual([...ids].sort());
    },
  );

  it("sees a provider whose section is gone", () => {
    const page = readDocPage("(configure)/providers", "").replace(/id: "libretranslate"/g, "");

    expect(providerSectionIds(page)).not.toContain("libretranslate");
  });
});

function doctorSetupTitles() {
  const source = readRepoFile("packages/sdk/src/flow/doctor.ts");
  const titles = /const CHECK_TITLES: Record<DoctorCheckId, string> = \{([\s\S]*?)\n\};/.exec(
    source,
  )?.[1];
  const dependent = /const CONFIG_DEPENDENT_IDS: readonly DoctorCheckId\[\] = \[([\s\S]*?)\];/.exec(
    source,
  )?.[1];
  if (titles === undefined || dependent === undefined) {
    throw new Error("CHECK_TITLES or CONFIG_DEPENDENT_IDS could not be located in doctor.ts");
  }
  const titleOf = new Map(
    [...titles.matchAll(/^ {2}"?([a-z-]+)"?: "([^"]+)",$/gm)].map((match) => [match[1], match[2]]),
  );
  const ids = ["config", ...[...dependent.matchAll(/"([a-z-]+)"/g)].map((match) => match[1])];
  return { all: [...titleOf.values()], setup: ids.map((id) => titleOf.get(id)) };
}

function documentedDoctorChecks(page) {
  const configTitle = doctorSetupTitles().setup[0];
  return tableStartingWith(page, (line) => line.startsWith(`| ${configTitle} |`)).map(firstCell);
}

describe("the doctor page lists every check doctor runs", () => {
  const titles = doctorSetupTitles();

  it("reads the setup checks in the order doctor reports them", () => {
    expect(titles.setup.length).toBeGreaterThanOrEqual(8);
    expect(titles.setup[0]).toBe("Configuration");
    expect(titles.setup).not.toContain(undefined);
    expect(titles.all.length).toBeGreaterThan(titles.setup.length);
  });

  it.each(LOCALE_SUFFIXES)("has one row per setup check, in order, in doctor%s.mdx", (suffix) => {
    expect(documentedDoctorChecks(readDocPage("cli/doctor", suffix))).toEqual(titles.setup);
  });

  it.each(LOCALE_SUFFIXES)("names every check title in doctor%s.mdx", (suffix) => {
    const page = readDocPage("cli/doctor", suffix);

    expect(titles.all.filter((title) => !page.includes(title))).toEqual([]);
  });

  it("sees a dropped check row", () => {
    const page = readDocPage("cli/doctor", "").replace(/^\| Locale codes \|.*\n/m, "");

    expect(documentedDoctorChecks(page)).not.toEqual(titles.setup);
  });
});

function commandBlocks() {
  const source = readRepoFile("packages/cli/src/run.ts");
  const starts = [...source.matchAll(/\.command\("([a-z]+)"\)/g)];
  return starts.map((match, index) => {
    const end = starts[index + 1]?.index ?? source.indexOf("\nfunction ", match.index);
    return { name: match[1], body: source.slice(match.index, end) };
  });
}

function commandFlags(body) {
  return [...body.matchAll(/\.option\(\s*"(?:-[a-zA-Z], )?(--[a-z][a-z-]*)/g)]
    .map((match) => match[1])
    .sort();
}

function documentedFlags(page) {
  const table = tableStartingWith(page, (line) => line.startsWith("| `--"));
  return table
    .flatMap((row) => codeSpans(firstCell(row)).filter((span) => span.startsWith("--")))
    .sort();
}

function cliMetaCommands(suffix) {
  const meta = JSON.parse(readRepoFile(`apps/docs/content/docs/cli/meta${suffix}.json`));
  return meta.pages.filter((page) => page !== "index" && !page.startsWith("---")).sort();
}

function cliOverviewCommands(suffix) {
  const page = readDocPage("cli/index", suffix);
  return [...page.matchAll(/^\| \[`([a-z]+)`\]\(\/docs\/cli\/\1\) \|/gm)]
    .map((match) => match[1])
    .sort();
}

function jsonCommandList(suffix) {
  const line = readDocPage("(guides)/ci-and-exit-codes", suffix)
    .split("\n")
    .find((text) => /`--json`/.test(text) && /`studio`/.test(text) && /`init`/.test(text));
  return codeSpans(line ?? "")
    .filter((span) => /^[a-z]+$/.test(span) && span !== "studio" && span !== "mcp")
    .sort();
}

describe("the CLI reference covers every command", () => {
  const blocks = commandBlocks();
  const names = blocks.map(({ name }) => name).sort();

  it("reads every registered command and its flags", () => {
    expect(names.length).toBeGreaterThanOrEqual(10);
    expect(names).toContain("translate");
    expect(blocks.find(({ name }) => name === "translate")?.body).toContain('"--dry-run"');
  });

  it.each(LOCALE_SUFFIXES)("lists every command in cli/meta%s.json", (suffix) => {
    expect(cliMetaCommands(suffix)).toEqual(names);
  });

  it.each(LOCALE_SUFFIXES)("links every command from the table in cli/index%s.mdx", (suffix) => {
    expect(cliOverviewCommands(suffix)).toEqual(names);
  });

  it.each(LOCALE_SUFFIXES)("names every --json command in ci-and-exit-codes%s.mdx", (suffix) => {
    const withJson = blocks
      .filter(({ body }) => commandFlags(body).includes("--json"))
      .map(({ name }) => name)
      .sort();

    expect(jsonCommandList(suffix)).toEqual(withJson);
  });

  describe.each(blocks.map(({ name, body }) => [name, commandFlags(body)]))(
    "verbatra %s",
    (name, flags) => {
      it.each(LOCALE_SUFFIXES)(`documents exactly its flags in cli/${name}%s.mdx`, (suffix) => {
        expect(documentedFlags(readDocPage(`cli/${name}`, suffix))).toEqual(flags);
      });
    },
  );

  it("sees an undocumented flag and a documented flag the command lost", () => {
    const page = readDocPage("cli/translate", "");
    const flags = commandFlags(blocks.find(({ name }) => name === "translate")?.body ?? "");

    expect(documentedFlags(page.replace(/^\| `--prune` \|.*\n/m, ""))).not.toEqual(flags);
    expect(
      documentedFlags(
        page.replace(/^(\| `--prune` \|.*\n)/m, "$1| `--retired` | none | off | gone |\n"),
      ),
    ).not.toEqual(flags);
  });
});
