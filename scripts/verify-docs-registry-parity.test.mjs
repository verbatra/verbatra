import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CLI_REFERENCE_PAGES,
  COMMAND_PAGE_CEILING,
  proseWords,
} from "../apps/docs/lib/page-type.ts";
import { STACK_IDS, STACKS } from "../apps/docs/lib/stacks.ts";

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

const SYNTAX_SAMPLES = new Map([
  ["{{name}}", "double-brace"],
  ["{name}", "single-brace"],
  ["%s", "printf"],
  ["%(name)s", "python-named"],
  ["%{name}", "ruby"],
  ["$" + "{name}", "dollar-brace"],
]);

function syntaxList(text, named) {
  const inner = text.trim().replace(/^\[|\]$/g, "");
  return inner
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "")
    .flatMap((item) => {
      const reference = /^(?:\.\.\.)?([A-Z_]+)$/.exec(item)?.[1];
      return reference === undefined ? [item.replace(/"/g, "")] : (named.get(reference) ?? []);
    });
}

function nativePlaceholderSyntaxes() {
  const source = readRepoFile("packages/sdk/src/flow/foreign-placeholders.ts");
  const named = new Map(
    [...source.matchAll(/^const ([A-Z_]+): readonly PlaceholderSyntax\[\] = (\[[^\]]*\]);/gm)].map(
      (match) => [match[1], syntaxList(match[2], new Map())],
    ),
  );
  const body = /NATIVE_PLACEHOLDER_SYNTAXES[\s\S]*?= \{([\s\S]*?)\n\};/.exec(source)?.[1];
  if (body === undefined) {
    throw new Error("NATIVE_PLACEHOLDER_SYNTAXES could not be located in foreign-placeholders.ts");
  }
  return new Map(
    [...body.matchAll(/^\s+"?([a-z0-9-]+)"?: (.+),$/gm)].map((match) => [
      match[1],
      syntaxList(match[2], named).sort(),
    ]),
  );
}

function documentedNativeSyntaxes(page) {
  const table = tableStartingWith(page, (line) => line.startsWith("|"));
  return new Map(
    table.slice(2).map((row) => {
      const cells = row.split(" | ");
      const lastCell = cells[cells.length - 1] ?? "";
      const syntaxes = codeSpans(lastCell).map((span) => SYNTAX_SAMPLES.get(span) ?? span);
      return [codeSpans(firstCell(row))[0], syntaxes.sort()];
    }),
  );
}

describe("the formats overview names the placeholder syntaxes each format never flags", () => {
  const native = nativePlaceholderSyntaxes();

  it("reads one native syntax list per built-in format", () => {
    expect([...native.keys()].sort()).toEqual([...supportedFormats()].sort());
    expect(native.get("gettext-po")).toEqual(["printf", "python-named"]);
    expect(native.get("ini")).toEqual(["dollar-brace", "ruby", "single-brace"]);
  });

  it.each(LOCALE_SUFFIXES)("formats%s.mdx matches NATIVE_PLACEHOLDER_SYNTAXES", (suffix) => {
    expect(documentedNativeSyntaxes(readDocPage("(configure)/formats", suffix))).toEqual(native);
  });

  it("sees a dropped syntax in a row", () => {
    const page = readDocPage("(configure)/formats", "").replace(
      /^(\| `gettext-po` \|.*), `%\(name\)s` \|$/m,
      "$1 |",
    );

    expect(documentedNativeSyntaxes(page).get("gettext-po")).toEqual(["printf"]);
  });
});

function initDefaultPatterns() {
  const source = readRepoFile("packages/cli/src/init-config.ts");
  const table = /export const DEFAULT_LAYOUTS[^=]*= \{([\s\S]*?)\n\};/.exec(source)?.[1];
  if (table === undefined) {
    throw new Error("DEFAULT_LAYOUTS could not be located in init-config.ts");
  }
  return new Map(
    [...table.matchAll(/"?([a-z0-9-]+)"?: \{\s*pattern: "([^"]+)"/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

function stackSectionsFor(page, format) {
  return page
    .split(/^## /m)
    .slice(1)
    .filter((section) => section.includes(`<InitCommand format="${format}" />\n`));
}

function headingSlug(heading) {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/ /g, "-");
}

function stackCardsBlock(page) {
  return /<StackCards\n[\s\S]*?\n\/>/.exec(page)?.[0] ?? "";
}

function cardField(card, name) {
  return new RegExp(`\\b${name}: "([^"]*)"`).exec(card)?.[1];
}

function stackCards(page) {
  return [...stackCardsBlock(page).matchAll(/\{([^{}]*)\}/g)].map(([, card]) => {
    const href = cardField(card, "href") ?? "";
    const formats = /\bformats: \[([^\]]*)\]/.exec(card)?.[1] ?? "";
    return {
      label: cardField(card, "label"),
      badge: cardField(card, "badge"),
      formats: [...formats.matchAll(/"([a-z0-9-]+)"/g)].map((format) => format[1]),
      path: href.split("#")[0],
      anchor: href.split("#")[1],
    };
  });
}

function expectEveryCardParsed(page) {
  const labels = stackCardsBlock(page).match(/\blabel: /g) ?? [];
  expect(labels.length).toBeGreaterThan(0);
  expect(stackCards(page)).toHaveLength(labels.length);
}

function sectionAnchors(page) {
  return page
    .split(/^## /m)
    .slice(1)
    .map((section) => headingSlug(section.split("\n", 1)[0]));
}

const STACK_PAGE = /^\/docs\/quickstart\/([a-z]+)$/;

function stackPageOf(card) {
  return STACK_PAGE.exec(card.path)?.[1];
}

function expectStackPageCard(card, stackId) {
  expect(STACK_IDS, card.label).toContain(stackId);
  expect(card.anchor, card.label).toBeUndefined();
  expect(card.formats, card.label).toEqual([STACKS[stackId].format]);
}

function expectCardsCoverEveryFormat(cards, stackPage, formats) {
  expect([...new Set(cards.flatMap((card) => card.formats))].sort()).toEqual([...formats].sort());
  const anchors = sectionAnchors(stackPage);
  for (const card of cards) {
    const stackId = stackPageOf(card);
    if (stackId !== undefined) {
      expectStackPageCard(card, stackId);
      continue;
    }
    expect(anchors, card.label).toContain(card.anchor);
    for (const format of card.formats) {
      expect(card.anchor, format).toBe(stackSectionAnchor(stackPage, format));
    }
  }
}

function stackSectionAnchor(page, format) {
  const [section] = stackSectionsFor(page, format);
  return section === undefined ? undefined : headingSlug(section.split("\n", 1)[0]);
}

describe("the stack quickstart table", () => {
  const patterns = initDefaultPatterns();

  it.each(STACK_IDS)("gives %s a built-in format and the layout init writes for it", (id) => {
    const stack = STACKS[id];
    expect(stack.id).toBe(id);
    expect(supportedFormats()).toContain(stack.format);
    expect(stack.pattern).toBe(patterns.get(stack.format));
  });

  it("names each format once, so no two stack pages describe the same files", () => {
    const formats = STACK_IDS.map((id) => STACKS[id].format);
    expect(new Set(formats).size).toBe(formats.length);
  });
});

describe("the pick-your-stack page covers every built-in format", () => {
  const formats = supportedFormats();
  const patterns = initDefaultPatterns();

  it("reads the default layout init writes for every format", () => {
    expect([...patterns.keys()].sort()).toEqual([...formats].sort());
  });

  it.each(LOCALE_SUFFIXES)(
    "gives each format one section with its init command and layout in pick-your-stack%s.mdx",
    (suffix) => {
      const page = readDocPage("(get-started)/pick-your-stack", suffix);
      for (const format of formats) {
        const sections = stackSectionsFor(page, format);
        expect(sections, format).toHaveLength(1);
        expect(sections[0], format).toContain(`\`${patterns.get(format)}\``);
        expect(sections[0], format).toMatch(/\]\(\/docs\/formats#[^)]+\)/);
      }
      const cards = stackCards(page);
      expect(cards.every((card) => card.path === "" && card.badge === undefined)).toBe(true);
      const ids = cards.flatMap((card) => card.formats);
      expect(new Set(ids).size, "one card per format on pick-your-stack").toBe(ids.length);
      expectEveryCardParsed(page);
      expect(page).toContain('<StackCards\n  labelledBy="page-title"');
      expectCardsCoverEveryFormat(cards, page, formats);
      const commands = [...page.matchAll(/<InitCommand format="([a-z0-9-]+)" \/>/g)];
      expect(commands.map((match) => match[1]).sort()).toEqual([...formats].sort());
    },
  );

  it.each(LOCALE_SUFFIXES)(
    "links the docs home stack cards to the section of every format in index%s.mdx",
    (suffix) => {
      const home = readDocPage("index", suffix);
      const cards = stackCards(home);
      expectEveryCardParsed(home);
      expect(home).toMatch(
        /<DocsHomeSection id="pick-your-stack" [^>]*>\n\n<StackCards\n {2}labelledBy="pick-your-stack"/,
      );
      for (const card of cards) {
        const stackPage = stackPageOf(card) !== undefined;
        expect(stackPage || card.path === "/docs/pick-your-stack", card.label).toBe(true);
        expect(card.badge !== undefined, card.label).toBe(stackPage);
      }
      expect(cards.flatMap((card) => stackPageOf(card) ?? []).sort()).toEqual(
        [...STACK_IDS].sort(),
      );
      expectCardsCoverEveryFormat(
        cards,
        readDocPage("(get-started)/pick-your-stack", suffix),
        formats,
      );
    },
  );

  it("sees a format whose section, card, or layout is missing or wrong", () => {
    const page = readDocPage("(get-started)/pick-your-stack", "");
    const withoutIni = page.replace('<InitCommand format="ini" />\n', "");
    expect(stackSectionsFor(withoutIni, "ini")).toHaveLength(0);
    const covers = (variant) => () =>
      expectCardsCoverEveryFormat(stackCards(variant), page, supportedFormats());
    expect(covers(page)).not.toThrow();
    expect(covers(page.replace('href: "#ini"', 'href: "#yaml"'))).toThrow();
    expect(covers(page.replace('formats: ["ini"]', "formats: []"))).toThrow();
    expect(covers(page.replace('formats: ["ini"]', 'formats: ["ini", "yaml"]'))).toThrow();
    expect(covers(page.replace('href: "#ini"', 'href: "#nowhere"'))).toThrow();
    const home = readDocPage("index", "");
    const homeCovers = (variant) => () =>
      expectCardsCoverEveryFormat(stackCards(variant), page, supportedFormats());
    expect(homeCovers(home)).not.toThrow();
    expect(homeCovers(home.replace(/(label: "Nuxt"[^}]*href: "[^"#]*#)[^"]+/, "$1yaml"))).toThrow();
    expect(homeCovers(home.replace("/docs/quickstart/vue", "/docs/quickstart/svelte"))).toThrow();
    expect(
      homeCovers(
        home.replace(
          'formats: ["arb"], href: "/docs/quickstart/flutter"',
          'formats: ["arb"], href: "/docs/quickstart/react"',
        ),
      ),
    ).toThrow();
    const reordered = page.replace(
      '{ label: "INI", icon: "ini", formats: ["ini"], href: "#ini" }',
      '{ href: "#ini", formats: ["ini"], icon: "ini", label: "INI" }',
    );
    expect(reordered).not.toBe(page);
    expect(stackCards(reordered)).toEqual(stackCards(page));
    const unparsable = page.replace('href: "#ini" },', 'href: "#ini",');
    expect(() => expectEveryCardParsed(unparsable)).toThrow();
    const wrongLayout = page.replaceAll("`locales/{locale}.ini`", "`config/{locale}.ini`");
    expect(stackSectionsFor(wrongLayout, "ini")[0]).not.toContain("`locales/{locale}.ini`");
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

const SHARED_COMMAND_FLAGS = ["--config", "--cwd", "--json"];

const GLOBAL_FLAGS_ANCHOR = {
  "": "global-flags",
  ".de": "globale-flags",
  ".es": "flags-globales",
  ".fr": "options-globales",
};

const COMMAND_PAGE_SECTIONS = {
  "": ["Synopsis", "Flags", "Behavior", "Examples", "Exit codes", "Related"],
  ".de": ["Synopsis", "Flags", "Verhalten", "Beispiele", "Exit-Codes", "Siehe auch"],
  ".es": ["Sinopsis", "Flags", "Comportamiento", "Ejemplos", "Códigos de salida", "Relacionado"],
  ".fr": ["Synopsis", "Options", "Comportement", "Exemples", "Codes de sortie", "Voir aussi"],
};

const OPTIONAL_SECTION_INDEX = 2;

const MAX_EFFECT_WORDS = 25;

function commandBlocks() {
  const source = readRepoFile("packages/cli/src/run.ts");
  const starts = [...source.matchAll(/\.command\("([a-z]+)"\)/g)];
  return starts.map((match, index) => {
    const end = starts[index + 1]?.index ?? source.indexOf("\nfunction ", match.index);
    return { name: match[1], body: source.slice(match.index, end) };
  });
}

function programFlags() {
  const source = readRepoFile("packages/cli/src/run.ts");
  const body = /function buildProgram\([\s\S]*?\n {2}const settings/.exec(source)?.[0];
  if (body === undefined) {
    throw new Error("buildProgram could not be located in run.ts");
  }
  const version = body.includes(".version(") ? ["--version"] : [];
  return [...commandFlags(body), "--help", ...version].sort();
}

function commandFlags(body) {
  return [...body.matchAll(/\.option\(\s*"(?:-[a-zA-Z], )?(--[a-z][a-z-]*)/g)]
    .map((match) => match[1])
    .sort();
}

function flagsTable(page, firstFlag) {
  return tableStartingWith(page, (line) => line.startsWith(`| \`${firstFlag}`));
}

function longFlagsIn(row) {
  return codeSpans(firstCell(row)).filter((span) => span.startsWith("--"));
}

function documentedFlags(page) {
  return flagsTable(page, "--").flatMap(longFlagsIn).sort();
}

function globalFlagRows(page) {
  return new Map(
    flagsTable(page, "--cwd").flatMap((row) => {
      const cells = row.replace(/^\| /, "").replace(/ \|$/, "").split(" | ");
      const commands = codeSpans(cells.at(-1) ?? "").filter((span) => /^[a-z]+$/.test(span));
      return longFlagsIn(row).map((flag) => [flag, commands.sort()]);
    }),
  );
}

function effectWordCounts(page) {
  return flagsTable(page, "--").map((row) => {
    const effect = row.replace(/ \|$/, "").split(" | ").at(-1) ?? "";
    return effect
      .replace(/\]\([^)]*\)/g, "]")
      .split(/\s+/)
      .filter(Boolean).length;
  });
}

function h2Headings(page) {
  return outsideCodeFences(page)
    .filter((line) => line.startsWith("## "))
    .map((line) => line.slice(3).trim());
}

function expectedSections(page, suffix) {
  const sections = COMMAND_PAGE_SECTIONS[suffix];
  const optional = sections[OPTIONAL_SECTION_INDEX];
  return h2Headings(page).includes(optional)
    ? sections
    : sections.filter((section) => section !== optional);
}

function cliMetaCommands(suffix) {
  const meta = JSON.parse(readRepoFile(`apps/docs/content/docs/cli/meta${suffix}.json`));
  return meta.pages
    .filter((page) => !CLI_REFERENCE_PAGES.includes(page) && !page.startsWith("---"))
    .sort();
}

function cliOverviewCommands(suffix) {
  const page = readDocPage("cli/index", suffix);
  return [...page.matchAll(/^ {2}<Card title="([a-z]+)" href="\/docs\/cli\/\1">/gm)]
    .map((match) => match[1])
    .sort();
}

describe("the CLI reference covers every command", () => {
  const blocks = commandBlocks();
  const names = blocks.map(({ name }) => name).sort();

  it("reads every registered command and its flags", () => {
    expect(names.length).toBeGreaterThanOrEqual(10);
    expect(names).toContain("translate");
    expect(blocks.find(({ name }) => name === "translate")?.body).toContain('"--dry-run"');
    expect(programFlags()).toEqual(["--help", "--no-color", "--quiet", "--version"]);
  });

  it.each(LOCALE_SUFFIXES)(
    "lists every command and the reference pages in cli/meta%s.json",
    (suffix) => {
      const meta = JSON.parse(readRepoFile(`apps/docs/content/docs/cli/meta${suffix}.json`));

      expect(cliMetaCommands(suffix)).toEqual(names);
      expect(meta.pages).toEqual(expect.arrayContaining(CLI_REFERENCE_PAGES));
    },
  );

  it.each(LOCALE_SUFFIXES)("links every command from a card in cli/index%s.mdx", (suffix) => {
    expect(cliOverviewCommands(suffix)).toEqual(names);
  });

  it.each(LOCALE_SUFFIXES)(
    "documents each shared and program flag once in the global flags of cli/index%s.mdx",
    (suffix) => {
      const rows = globalFlagRows(readDocPage("cli/index", suffix));
      const expected = new Map([
        ...SHARED_COMMAND_FLAGS.map((flag) => [
          flag,
          blocks
            .filter(({ body }) => !commandFlags(body).includes(flag))
            .map(({ name }) => name)
            .sort(),
        ]),
        ...programFlags().map((flag) => [flag, []]),
      ]);

      expect(Object.fromEntries(rows)).toEqual(Object.fromEntries(expected));
    },
  );

  describe.each(blocks.map(({ name, body }) => [name, commandFlags(body)]))(
    "verbatra %s",
    (name, flags) => {
      const own = flags.filter((flag) => !SHARED_COMMAND_FLAGS.includes(flag));

      it.each(LOCALE_SUFFIXES)(
        `documents exactly its own flags and links the global flags in cli/${name}%s.mdx`,
        (suffix) => {
          const page = readDocPage(`cli/${name}`, suffix);

          expect(documentedFlags(page)).toEqual(own);
          expect(page).toContain(`](/docs/cli#${GLOBAL_FLAGS_ANCHOR[suffix]})`);
        },
      );

      it.each(LOCALE_SUFFIXES)(
        `follows the command page template in cli/${name}%s.mdx`,
        (suffix) => {
          const page = readDocPage(`cli/${name}`, suffix);

          expect(h2Headings(page)).toEqual(expectedSections(page, suffix));
        },
      );

      it(`keeps cli/${name}.mdx short, with a short effect per flag`, () => {
        const page = readDocPage(`cli/${name}`, "");

        expect(proseWords(page)).toBeLessThanOrEqual(COMMAND_PAGE_CEILING);
        expect(Math.max(...effectWordCounts(page))).toBeLessThanOrEqual(MAX_EFFECT_WORDS);
      });
    },
  );

  it("sees an undocumented flag, a documented flag the command lost, and a repeated shared flag", () => {
    const page = readDocPage("cli/translate", "");
    const flags = commandFlags(blocks.find(({ name }) => name === "translate")?.body ?? "").filter(
      (flag) => !SHARED_COMMAND_FLAGS.includes(flag),
    );

    expect(documentedFlags(page)).toEqual(flags);
    expect(documentedFlags(page.replace(/^\| `--prune` \|.*\n/m, ""))).not.toEqual(flags);
    expect(
      documentedFlags(
        page.replace(/^(\| `--prune` \|.*\n)/m, "$1| `--retired` | none | off | gone |\n"),
      ),
    ).not.toEqual(flags);
    expect(
      documentedFlags(page.replace(/^(\| `--prune` \|.*\n)/m, "$1| `--cwd` | x | x | x |\n")),
    ).not.toEqual(flags);
  });

  it("sees a global flag row that is missing or names the wrong commands", () => {
    const page = readDocPage("cli/index", "");
    const rows = globalFlagRows(page);

    expect(globalFlagRows(page.replace(/^\| `--no-color` \|.*\n/m, "")).has("--no-color")).toBe(
      false,
    );
    expect(rows.get("--json")).toEqual(["mcp", "studio"]);
    expect(
      globalFlagRows(page.replace(/^(\| `--json` \|.*)`studio`/m, "$1`init`")).get("--json"),
    ).not.toEqual(rows.get("--json"));
  });

  it("sees a page that drops a template section or reorders two", () => {
    const page = "## Synopsis\n## Flags\n## Examples\n## Exit codes\n## Related\n";

    expect(h2Headings(page)).toEqual(expectedSections(page, ""));
    expect(h2Headings(page.replace("## Examples\n", ""))).not.toEqual(expectedSections(page, ""));
    const swapped = "## Synopsis\n## Examples\n## Flags\n## Exit codes\n## Related\n";
    expect(h2Headings(swapped)).not.toEqual(expectedSections(swapped, ""));
  });
});
