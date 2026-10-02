import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const LOCALE_SUFFIXES = ["", ".de", ".es", ".fr"];

const ENTRY_POINT_NAME = /^[a-z][A-Za-z0-9]*$/;

function readRepoFile(relativePath) {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

function readDocPage(prefix, suffix) {
  return readRepoFile(`apps/docs/content/docs/${prefix}${suffix}.mdx`);
}

function sdkReferencePages() {
  return JSON.parse(readRepoFile("apps/docs/content/docs/sdk/meta.json")).pages;
}

function readSdkReference(suffix) {
  return sdkReferencePages()
    .map((page) => readDocPage(`sdk/${page}`, suffix))
    .join("\n");
}

function quotedCodes(block) {
  return [...block.matchAll(/"([A-Z_]+)"/g)].map((match) => match[1]);
}

function unionCodes(relativePath, name) {
  const union = new RegExp(`export type ${name} =([\\s\\S]*?);`).exec(readRepoFile(relativePath));
  if (union?.[1] === undefined) {
    throw new Error(`the ${name} union could not be located in ${relativePath}`);
  }
  return quotedCodes(union[1]);
}

function constCodes(relativePath, name) {
  const list = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`).exec(
    readRepoFile(relativePath),
  );
  if (list?.[1] === undefined) {
    throw new Error(`the ${name} list could not be located in ${relativePath}`);
  }
  return quotedCodes(list[1]);
}

const STRING_LITERAL = /^(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/;

function unquote(literal) {
  const match = STRING_LITERAL.exec(literal);
  return match === null ? undefined : (match[1] ?? match[2]).replace(/\\(["'])/g, "$1");
}

function hintTable(relativePath, tableName) {
  const source = readRepoFile(relativePath);
  const constants = new Map(
    [...source.matchAll(/^const ([A-Z_]+) =\s*((?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'));$/gm)].map(
      (match) => [match[1], unquote(match[2])],
    ),
  );
  const body = new RegExp(`const ${tableName} = \\{([\\s\\S]*?)\\} as const`).exec(source)?.[1];
  if (body === undefined) {
    throw new Error(`${tableName} could not be located in ${relativePath}`);
  }
  const hints = new Map();
  for (const [, code, value] of body.matchAll(
    /^ {2}([A-Z_]+):\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[A-Z_.]+|undefined),$/gm,
  )) {
    hints.set(
      code,
      value === "undefined" ? undefined : (unquote(value) ?? constants.get(value) ?? value),
    );
  }
  return hints;
}

function resolveHintReferences(hints, referenced) {
  return new Map(
    [...hints].map(([code, hint]) => {
      const reference = /^[A-Z_]+\.([A-Z_]+)$/.exec(hint ?? "");
      return [code, reference === null ? hint : referenced.get(reference[1])];
    }),
  );
}

const SDK_HINTS_FILE = "packages/sdk/src/error-hints.ts";
const SDK_HINTS = hintTable(SDK_HINTS_FILE, "SDK_ERROR_HINTS");

const ERROR_CODE_FAMILIES = [
  {
    id: "cli-error-codes",
    codes: constCodes("packages/cli/src/cli-error-codes.ts", "CLI_ERROR_CODES"),
    hints: hintTable("packages/cli/src/cli-error-hints.ts", "CLI_ERROR_HINTS"),
  },
  {
    id: "sdk-error-codes",
    codes: unionCodes("packages/sdk/src/errors.ts", "SdkErrorCode"),
    hints: SDK_HINTS,
  },
  {
    id: "provider-error-codes",
    codes: unionCodes("packages/ai-providers/src/errors.ts", "ProviderErrorCode"),
    hints: resolveHintReferences(hintTable(SDK_HINTS_FILE, "PROVIDER_ERROR_HINTS"), SDK_HINTS),
  },
  {
    id: "adapter-error-codes",
    codes: unionCodes("packages/format-adapters/src/errors.ts", "AdapterErrorCode"),
    hints: hintTable(SDK_HINTS_FILE, "ADAPTER_ERROR_HINTS"),
  },
];

const RESULT_CODE_FAMILIES = [
  {
    id: "check-result-codes",
    codes: unionCodes("packages/sdk/src/flow/check.ts", "CheckReviewCode"),
  },
  {
    id: "review-reason-codes",
    codes: constCodes("packages/ai-providers/src/provider.ts", "REVIEW_REASON_CODES"),
  },
  {
    id: "sdk-notice-codes",
    codes: unionCodes("packages/sdk/src/flow/summary.ts", "SdkNoticeCode"),
  },
  {
    id: "provider-notice-codes",
    codes: unionCodes("packages/ai-providers/src/provider.ts", "ProviderNoticeCode"),
  },
];

const NEXT_STEP_LABEL = {
  "": "Next step",
  ".de": "Nächster Schritt",
  ".es": "Siguiente paso",
  ".fr": "Étape suivante",
};

function errorCodesPage(suffix) {
  return readDocPage("(reference)/error-codes", suffix);
}

function familySections(page) {
  const sections = new Map();
  let current;
  for (const line of page.split("\n")) {
    const family = /^## .* \[#([a-z-]+)\]$/.exec(line);
    if (family !== null) {
      current = { entries: [] };
      sections.set(family[1], current);
      continue;
    }
    const code = /^### ([A-Z_]+)(?: \[#([a-z_-]+)\])?$/.exec(line);
    if (code !== null && current !== undefined) {
      current.entries.push({
        code: code[1],
        anchor: code[2] ?? code[1].toLowerCase(),
        bullets: [],
      });
      continue;
    }
    const bullet = /^- \*\*(.+?)\*\* ?: (.*)$/.exec(line);
    if (bullet !== null) {
      current?.entries.at(-1)?.bullets.push({ label: bullet[1], text: bullet[2] });
    }
  }
  return sections;
}

function documentedCodes(page, familyId) {
  return familySections(page)
    .get(familyId)
    ?.entries.map(({ code }) => code);
}

function documentedHints(page, familyId, suffix) {
  const entries = familySections(page).get(familyId)?.entries ?? [];
  return new Map(
    entries.map(({ code, bullets }) => [
      code,
      bullets.find(({ label }) => label === NEXT_STEP_LABEL[suffix])?.text,
    ]),
  );
}

function documentedAnchors(page) {
  return [...familySections(page).values()].flatMap(({ entries }) =>
    entries.map(({ anchor }) => anchor),
  );
}

function blockExportNames(members) {
  const names = [];
  for (const raw of members.split(",")) {
    const member = raw.trim();
    if (member !== "" && !member.startsWith("type ")) {
      names.push(member.split(/\s+as\s+/)[0].trim());
    }
  }
  return names;
}

function sdkValueExports() {
  const source = readRepoFile("packages/sdk/src/index.ts");
  const exports = [];
  for (const block of source.matchAll(/export\s+(type\s+)?\{([\s\S]*?)\}\s+from\s+"([^"]+)";/g)) {
    if (block[1] !== undefined) {
      continue;
    }
    for (const name of blockExportNames(block[2])) {
      exports.push({ name, module: block[3] });
    }
  }
  return exports.sort((left, right) => left.name.localeCompare(right.name));
}

function resolveStringConstant({ name, module }) {
  if (!module.startsWith("./")) {
    return undefined;
  }
  const source = readRepoFile(`packages/sdk/src/${module.slice(2).replace(/\.js$/, ".ts")}`);
  return new RegExp(`export const ${name} = "([^"]*)";`).exec(source)?.[1];
}

function headingDocumentedExports(page) {
  return [...page.matchAll(/^#{2,4}\s+(\S+)[ \t]*$/gm)]
    .map((match) => match[1])
    .filter((text) => ENTRY_POINT_NAME.test(text))
    .sort();
}

function mentionsCodeSpan(page, token) {
  return page.includes(`\`${token}\``);
}

describe("the error codes page documents every code family verbatra reports", () => {
  it("extracts non-trivial code lists and hint tables, so the comparisons cannot pass vacuously", () => {
    const [cli, sdk, provider, adapter] = ERROR_CODE_FAMILIES;
    expect(cli.codes.length).toBeGreaterThanOrEqual(10);
    expect(cli.codes).toContain("USAGE_ERROR");
    expect(sdk.codes.length).toBeGreaterThanOrEqual(30);
    expect(sdk.codes[0]).toBe("CONFIG_NOT_FOUND");
    expect(provider.codes).toContain("PROVIDER_ERROR");
    expect(adapter.codes).toContain("INVALID_JSON");
    for (const family of ERROR_CODE_FAMILIES) {
      expect([...family.hints.keys()].sort()).toEqual([...family.codes].sort());
    }
    expect(provider.hints.get("NETWORK_POLICY_VIOLATION")).toBe(
      sdk.hints.get("NETWORK_POLICY_VIOLATION"),
    );
    expect(sdk.hints.get("TYPES_UNWRITABLE")).toMatch(/writable/);
    expect(cli.hints.get("CLI_ERROR")).toBeUndefined();
    expect(RESULT_CODE_FAMILIES.flatMap(({ codes }) => codes)).toEqual(
      expect.arrayContaining(["REVIEW_REQUIRED", "EQUALS_SOURCE", "PLURAL_CATEGORIES_INCOMPLETE"]),
    );
  });

  describe.each(LOCALE_SUFFIXES)("in error-codes%s.mdx", (suffix) => {
    const page = errorCodesPage(suffix);

    it.each([...ERROR_CODE_FAMILIES, ...RESULT_CODE_FAMILIES])(
      "heads one entry per $id code, in source order",
      ({ id, codes }) => {
        expect(documentedCodes(page, id)).toEqual(codes);
      },
    );

    it.each(ERROR_CODE_FAMILIES)("quotes the exact hint of every $id code", ({ id, hints }) => {
      expect(documentedHints(page, id, suffix)).toEqual(hints);
    });

    it("gives every code a unique anchor, the lower-case code wherever it is free", () => {
      const anchors = documentedAnchors(page);

      expect(new Set(anchors).size).toBe(anchors.length);
      expect(anchors).toEqual(expect.arrayContaining(["config_not_found", "config_invalid"]));
      expect(anchors.filter((anchor) => !/^[a-z_]+$/.test(anchor))).toEqual([
        "cli-config_invalid",
        "provider-network_policy_violation",
      ]);
    });
  });

  it("sees a dropped entry, an extra entry, a changed hint and a reordered family", () => {
    const page = errorCodesPage("");
    const [cli, sdk] = ERROR_CODE_FAMILIES;
    const withoutEntry = page.replace(/^### UNKNOWN_KEY$/m, "### Removed heading");
    const withExtra = page.replace(/^(### UNKNOWN_KEY)$/m, "### RETIRED_CODE\n\n$1");
    const changedHint = page.replace(
      "- **Next step**: Pass --port as a whole number from 1 to 65535.",
      "- **Next step**: Pass --port as a number.",
    );

    expect(documentedCodes(withoutEntry, "sdk-error-codes")).not.toContain("UNKNOWN_KEY");
    expect(documentedCodes(withExtra, "sdk-error-codes")).toContain("RETIRED_CODE");
    expect(documentedHints(changedHint, "cli-error-codes", "")).not.toEqual(cli.hints);
    expect(documentedCodes(page, "sdk-error-codes")).toEqual(sdk.codes);
    expect([...sdk.codes].reverse()).not.toEqual(sdk.codes);
  });

  it("does not count a code heading that sits outside the family's section", () => {
    const page = errorCodesPage("");
    const moved = page.replace(/^### USAGE_ERROR$/m, "## Stray [#stray]\n\n### USAGE_ERROR");

    expect(documentedCodes(moved, "cli-error-codes")).not.toContain("USAGE_ERROR");
  });
});

describe("the SDK reference catalogs the whole public surface", () => {
  const valueExports = sdkValueExports();
  const entryPoints = valueExports
    .map(({ name }) => name)
    .filter((name) => ENTRY_POINT_NAME.test(name))
    .sort();
  const inlineExports = valueExports.filter(({ name }) => !ENTRY_POINT_NAME.test(name));
  const constants = inlineExports
    .map((entry) => ({ name: entry.name, value: resolveStringConstant(entry) }))
    .filter((entry) => entry.value !== undefined);

  it("extracts a non-trivial export list, so the comparisons cannot pass vacuously", () => {
    expect(entryPoints.length).toBeGreaterThanOrEqual(15);
    expect(entryPoints).toContain("translate");
    expect(inlineExports.map(({ name }) => name)).toContain("SdkError");
    expect(constants.length).toBeGreaterThanOrEqual(4);
  });

  it("reads the whole reference folder, not only its overview", () => {
    expect(sdkReferencePages()).toEqual(expect.arrayContaining(["index", "run", "errors"]));
    expect(sdkReferencePages().length).toBeGreaterThanOrEqual(9);
  });

  it.each(LOCALE_SUFFIXES)(
    "heads exactly one section per entry point across sdk/*%s.mdx",
    (suffix) => {
      expect(headingDocumentedExports(readSdkReference(suffix))).toEqual(entryPoints);
    },
  );

  it.each(LOCALE_SUFFIXES)("names every inline value export in sdk/*%s.mdx", (suffix) => {
    const page = readSdkReference(suffix);

    expect(inlineExports.filter(({ name }) => !mentionsCodeSpan(page, name))).toEqual([]);
  });

  it.each(LOCALE_SUFFIXES)("prints the value each constant holds in sdk/*%s.mdx", (suffix) => {
    const page = readSdkReference(suffix);

    expect(constants.filter(({ value }) => !mentionsCodeSpan(page, value))).toEqual([]);
  });
});

const SDK_ERROR_CODES = new Set(unionCodes("packages/sdk/src/errors.ts", "SdkErrorCode"));

const THROWS_LINE = /^\*\*(?:Throws|Wirft|Lanza|Lève) ?:\*\* (.*)$/m;

function sdkTypeExports() {
  const source = readRepoFile("packages/sdk/src/index.ts");
  const names = [];
  for (const block of source.matchAll(/export\s+(type\s+)?\{([\s\S]*?)\}\s+from\s+"[^"]+";/g)) {
    for (const raw of block[2].split(",")) {
      const member = raw.trim().replace(/^type\s+/, "");
      if (member !== "" && (block[1] !== undefined || raw.trim().startsWith("type "))) {
        names.push(
          member
            .split(/\s+as\s+/)
            .at(-1)
            .trim(),
        );
      }
    }
  }
  return new Set(names);
}

function functionJsDoc({ name, module }) {
  if (!module.startsWith("./")) {
    return "";
  }
  const source = readRepoFile(`packages/sdk/src/${module.slice(2).replace(/\.js$/, ".ts")}`);
  const doc = new RegExp(
    `(/\\*\\*(?:(?!\\*/)[\\s\\S])*\\*/)\\s*export (?:async )?function ${name}\\b`,
  ).exec(source);
  return doc?.[1] ?? "";
}

function declaredThrows(name, exportsByName) {
  const entry = exportsByName.get(name);
  if (entry === undefined) {
    return [];
  }
  const codes = [];
  for (const tag of functionJsDoc(entry).split("@throws").slice(1)) {
    const text = tag.split(/\n\s*\*\s*@(?!link)/)[0];
    const inherited = /Every code \{@link (\w+)\} throws/.exec(text);
    if (inherited !== null) {
      codes.push(...declaredThrows(inherited[1], exportsByName));
    }
    for (const [, code] of text.matchAll(/`([A-Z_]+)`/g)) {
      if (SDK_ERROR_CODES.has(code)) {
        codes.push(code);
      }
    }
  }
  return [...new Set(codes)].sort();
}

function entrySections(page) {
  const sections = new Map();
  for (const section of page.split(/^### /m).slice(1)) {
    const [heading = "", ...body] = section.split("\n");
    if (ENTRY_POINT_NAME.test(heading.trim())) {
      sections.set(heading.trim(), body.join("\n").split(/^## /m)[0]);
    }
  }
  return sections;
}

function documentedThrows(section) {
  const line = THROWS_LINE.exec(section)?.[1] ?? "";
  return [...new Set([...line.matchAll(/\[`([A-Z_]+)`\]/g)].map((match) => match[1]))].sort();
}

describe("each SDK entry point states what it takes and what it throws", () => {
  const exportsByName = new Map(sdkValueExports().map((entry) => [entry.name, entry]));
  const typeExports = sdkTypeExports();

  it("reads the declared throws from the source, so the comparison cannot pass vacuously", () => {
    expect(declaredThrows("check", exportsByName)).toContain("UNKNOWN_LOCALE");
    expect(declaredThrows("editConfiguredGlossaryTerm", exportsByName)).toEqual(
      expect.arrayContaining(["UNKNOWN_LOCALE", "GLOSSARY_UNWRITABLE"]),
    );
    expect(declaredThrows("redact", exportsByName)).toEqual([]);
    expect(typeExports).toContain("TranslateInput");
  });

  it.each(LOCALE_SUFFIXES)(
    "lists exactly the declared codes under each entry in sdk/*%s.mdx",
    (suffix) => {
      const sections = entrySections(readSdkReference(suffix));
      const drift = [...sections]
        .map(([name, section]) => ({
          name,
          declared: declaredThrows(name, exportsByName),
          documented: documentedThrows(section),
        }))
        .filter(({ declared, documented }) => declared.join() !== documented.join());

      expect(sections.size).toBeGreaterThanOrEqual(50);
      expect(drift).toEqual([]);
    },
  );

  it.each(LOCALE_SUFFIXES)(
    "renders a type table only for an exported declaration in sdk/*%s.mdx",
    (suffix) => {
      const tables = [...readSdkReference(suffix).matchAll(/<SdkTypeTable name="(\w+)" \/>/g)].map(
        (match) => match[1],
      );

      expect(tables.length).toBeGreaterThanOrEqual(30);
      expect(tables.filter((name) => !typeExports.has(name) && !exportsByName.has(name))).toEqual(
        [],
      );
    },
  );

  it("sees a code that is thrown but missing from the page", () => {
    const section = "**Throws:** [`UNKNOWN_FORMAT`](/docs/error-codes#unknown_format)\n";

    expect(documentedThrows(section)).toEqual(["UNKNOWN_FORMAT"]);
    expect(documentedThrows(section)).not.toEqual(declaredThrows("check", exportsByName));
  });
});

describe("the SDK heading rule separates real drift from ordinary prose", () => {
  const page = readSdkReference("");

  it("sees an entry point headed on two pages of the folder", () => {
    const entryPoints = headingDocumentedExports(page);

    expect(headingDocumentedExports(`${page}\n### translate\n`)).not.toEqual(entryPoints);
  });

  it("sees an export that left index.ts but kept its section", () => {
    expect(headingDocumentedExports(`${page}\n### resetLockFile\n`)).toContain("resetLockFile");
  });

  it("is not satisfied by an incidental code span once the section is gone", () => {
    const stripped = page.replace(/^### check$/m, "### Inspecting state without writing");

    expect(stripped).toContain("`check`");
    expect(headingDocumentedExports(stripped)).not.toContain("check");
  });

  it("ignores prose headings, so ordinary documentation cannot trip the check", () => {
    const prose = "## Install\n\n### The workbook pair\n\n#### Notes on Config\n";

    expect(headingDocumentedExports(prose)).toEqual([]);
  });
});

function stringConstant(relativePath, name) {
  const value = new RegExp(`export const ${name} = "([^"]*)";`).exec(
    readRepoFile(relativePath),
  )?.[1];
  if (value === undefined) {
    throw new Error(`${name} could not be located in ${relativePath}`);
  }
  return value;
}

function configSearchPlaces() {
  const source = readRepoFile("packages/sdk/src/config/load-config.ts");
  const moduleName = /const MODULE_NAME = "([^"]+)";/.exec(source)?.[1];
  const list = /export const CONFIG_SEARCH_PLACES = \[([\s\S]*?)\];/.exec(source)?.[1];
  if (moduleName === undefined || list === undefined) {
    throw new Error("CONFIG_SEARCH_PLACES could not be located in load-config.ts");
  }
  return [...list.matchAll(/["`]([^"`]+)["`]/g)].map((match) =>
    match[1].replace(/\$\{MODULE_NAME\}/, moduleName),
  );
}

function typesOutputRefusals() {
  const source = readRepoFile("packages/sdk/src/flow/generate-types.ts");
  const table = /^export const TYPES_OUTPUT_REFUSALS = \[\n([^\]]*)\] as const;$/m.exec(
    source,
  )?.[1];
  if (table === undefined) {
    throw new Error("TYPES_OUTPUT_REFUSALS could not be located in generate-types.ts");
  }
  const extensions = /const TYPESCRIPT_EXTENSIONS = \[([^\]]*)\];/.exec(source)?.[1] ?? "";
  return {
    entries: table.split("\n").filter((line) => line.trim() !== ""),
    ids: [...table.matchAll(/^ {2}"([a-z-]+)",$/gm)].map((match) => match[1]),
    extensions: [...extensions.matchAll(/"([^"]+)"/g)].map((match) => match[1]),
  };
}

function documentedTypesRefusals(suffix) {
  const lines = readDocPage("cli/types", suffix).split("\n");
  const start = lines.findIndex((line) => line.includes("`TYPES_OUTPUT_CONFLICT`"));
  const bullets = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("- ")) {
      bullets.push(line);
    } else if (bullets.length > 0) {
      break;
    }
  }
  return bullets;
}

describe("the types page lists exactly the output paths generateTypes refuses", () => {
  const refusals = typesOutputRefusals();
  const names = [
    stringConstant("packages/sdk/src/lock/lock-file.ts", "LOCK_FILE_NAME"),
    stringConstant("packages/sdk/src/lock/provenance-file.ts", "PROVENANCE_FILE_NAME"),
    stringConstant("packages/sdk/src/cache/translation-memory.ts", "CACHE_FILE_NAME"),
    ...configSearchPlaces(),
    ...refusals.extensions,
  ];

  it("extracts the refusal set from the code, so the comparison cannot pass vacuously", () => {
    expect(refusals.ids.length).toBeGreaterThanOrEqual(10);
    expect(refusals.ids).toHaveLength(refusals.entries.length);
    expect(new Set(refusals.ids).size).toBe(refusals.ids.length);
    expect(refusals.extensions).toEqual([".ts", ".mts", ".cts"]);
    expect(names).toContain("verbatra.config.ts");
  });

  it.each(LOCALE_SUFFIXES)("has one bullet per refusal in types%s.mdx", (suffix) => {
    expect(documentedTypesRefusals(suffix)).toHaveLength(refusals.ids.length);
  });

  it.each(LOCALE_SUFFIXES)("names every reserved file and extension in types%s.mdx", (suffix) => {
    const page = readDocPage("cli/types", suffix);

    expect(names.filter((name) => !mentionsCodeSpan(page, name))).toEqual([]);
  });
});

const REVIEW_FLAG_ROW = /^\| \[`([A-Z_]+)`\]\(\/docs\/error-codes#[a-z_]+\) \|/;

function reviewFlagTable(page) {
  const lines = page.split("\n");
  const rows = lines.flatMap((line, index) => {
    const code = REVIEW_FLAG_ROW.exec(line)?.[1];
    return code === undefined ? [] : [{ code, index }];
  });
  const contiguous = rows.every(
    (row, position) => position === 0 || row.index === rows[position - 1].index + 1,
  );
  return { codes: rows.map(({ code }) => code), contiguous };
}

function docPagesCarryingEveryCode(codes, suffix) {
  const contentDir = resolve(REPO_ROOT, "apps/docs/content/docs");
  return readdirSync(contentDir, { recursive: true, encoding: "utf8" })
    .filter(
      (file) =>
        file.endsWith(`${suffix}.mdx`) && (suffix !== "" || !/\.(de|es|fr)\.mdx$/.test(file)),
    )
    .filter((file) => {
      const page = readFileSync(resolve(contentDir, file), "utf8");
      return codes.every((code) => new RegExp(`\\b${code}\\b`).test(page));
    })
    .sort();
}

describe("the review flag table on translation-safety lists exactly REVIEW_REASON_CODES", () => {
  const reviewReasons = constCodes("packages/ai-providers/src/provider.ts", "REVIEW_REASON_CODES");

  it("extracts a non-trivial reason list, so the comparison cannot pass vacuously", () => {
    expect(reviewReasons.length).toBeGreaterThanOrEqual(8);
    expect(reviewReasons).toContain("EQUALS_SOURCE");
  });

  it.each(LOCALE_SUFFIXES)("in translation-safety%s.mdx, in source order", (suffix) => {
    const table = reviewFlagTable(readDocPage("(concepts)/translation-safety", suffix));

    expect(table.codes).toEqual(reviewReasons);
    expect(table.contiguous).toBe(true);
  });

  it.each(LOCALE_SUFFIXES)("leaves the full set to its two owners in locale '%s'", (suffix) => {
    expect(docPagesCarryingEveryCode(reviewReasons, suffix)).toEqual([
      `(concepts)/translation-safety${suffix}.mdx`,
      `(reference)/error-codes${suffix}.mdx`,
    ]);
  });

  it("sees a dropped, an extra and a reordered reason", () => {
    const page = readDocPage("(concepts)/translation-safety", "");
    const firstRow = page.split("\n").find((line) => REVIEW_FLAG_ROW.test(line));
    const dropped = page.replace(`${firstRow}\n`, "");
    const extra = page.replace(
      firstRow,
      `${firstRow}\n| [\`RETIRED_REASON\`](/docs/error-codes#retired_reason) | was retired |`,
    );
    const lastRow = page
      .split("\n")
      .filter((line) => REVIEW_FLAG_ROW.test(line))
      .at(-1);
    const reordered = page
      .replace(`${firstRow}\n`, "")
      .replace(`${lastRow}\n`, `${lastRow}\n${firstRow}\n`);

    expect(reviewFlagTable(dropped).codes).toEqual(reviewReasons.slice(1));
    expect(reviewFlagTable(extra).codes).toEqual([
      reviewReasons[0],
      "RETIRED_REASON",
      ...reviewReasons.slice(1),
    ]);
    expect(reviewFlagTable(reordered).codes).toEqual([...reviewReasons.slice(1), reviewReasons[0]]);
    expect([...reviewFlagTable(reordered).codes].sort()).toEqual([...reviewReasons].sort());
    expect(reviewFlagTable(reordered).codes).not.toEqual(reviewReasons);
    expect(reviewFlagTable(page.replace(firstRow, `${firstRow}\n`)).contiguous).toBe(false);
  });
});
