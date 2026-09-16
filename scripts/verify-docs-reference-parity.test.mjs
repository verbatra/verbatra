import { readFileSync } from "node:fs";
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

function providerErrorCodes() {
  const source = readRepoFile("packages/ai-providers/src/errors.ts");
  const union = /export type ProviderErrorCode =([\s\S]*?);/.exec(source);
  if (union?.[1] === undefined) {
    throw new Error("the ProviderErrorCode union could not be located in errors.ts");
  }
  return [...union[1].matchAll(/"([A-Z_]+)"/g)].map((match) => match[1]).sort();
}

function documentedErrorCodes(suffix) {
  const page = readDocPage("(configure)/providers", suffix);
  return [...page.matchAll(/^\| `([A-Z_]+)` \|/gm)].map((match) => match[1]).sort();
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

describe("the providers page documents every provider error code", () => {
  const codes = providerErrorCodes();

  it("extracts a non-trivial union, so the comparisons cannot pass vacuously", () => {
    expect(codes.length).toBeGreaterThanOrEqual(10);
    expect(codes).toContain("PROVIDER_ERROR");
  });

  it.each(LOCALE_SUFFIXES)("has one table row per code in providers%s.mdx", (suffix) => {
    expect(documentedErrorCodes(suffix)).toEqual(codes);
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

  it.each(LOCALE_SUFFIXES)("heads one section per entry point in sdk%s.mdx", (suffix) => {
    expect(headingDocumentedExports(readDocPage("(sdk)/sdk", suffix))).toEqual(entryPoints);
  });

  it.each(LOCALE_SUFFIXES)("names every inline value export in sdk%s.mdx", (suffix) => {
    const page = readDocPage("(sdk)/sdk", suffix);

    expect(inlineExports.filter(({ name }) => !mentionsCodeSpan(page, name))).toEqual([]);
  });

  it.each(LOCALE_SUFFIXES)("prints the value each constant holds in sdk%s.mdx", (suffix) => {
    const page = readDocPage("(sdk)/sdk", suffix);

    expect(constants.filter(({ value }) => !mentionsCodeSpan(page, value))).toEqual([]);
  });
});

describe("the SDK heading rule separates real drift from ordinary prose", () => {
  const page = readDocPage("(sdk)/sdk", "");

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
  const pathChecks = [...source.matchAll(/^\s*refuseOutput\(requested, /gm)].length;
  const reservedDispatch = [...source.matchAll(/refuseOutput\(requested, `is \$\{claimed\}\.`\)/g)]
    .length;
  const reservedTargets = [...source.matchAll(/^\s*claim\(/gm)].length;
  const conflictThrows = [...source.matchAll(/new SdkError\(\s*"TYPES_OUTPUT_CONFLICT"/g)].length;
  const extensions = /const TYPESCRIPT_EXTENSIONS = \[([^\]]*)\];/.exec(source)?.[1] ?? "";
  return {
    pathChecks,
    reservedDispatch,
    reservedTargets,
    conflictThrows,
    count: pathChecks - reservedDispatch + reservedTargets + (conflictThrows - 1),
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
    stringConstant("packages/sdk/src/cache/translation-memory.ts", "CACHE_FILE_NAME"),
    ...configSearchPlaces(),
    ...refusals.extensions,
  ];

  it("extracts the refusal set from the code, so the comparison cannot pass vacuously", () => {
    expect(refusals.pathChecks).toBeGreaterThanOrEqual(4);
    expect(refusals.reservedDispatch).toBe(1);
    expect(refusals.reservedTargets).toBeGreaterThanOrEqual(4);
    expect(refusals.conflictThrows).toBeGreaterThanOrEqual(1);
    expect(refusals.extensions).toEqual([".ts", ".mts", ".cts"]);
    expect(names).toContain("verbatra.config.ts");
  });

  it.each(LOCALE_SUFFIXES)("has one bullet per refusal in types%s.mdx", (suffix) => {
    expect(documentedTypesRefusals(suffix)).toHaveLength(refusals.count);
  });

  it.each(LOCALE_SUFFIXES)("names every reserved file and extension in types%s.mdx", (suffix) => {
    const page = readDocPage("cli/types", suffix);

    expect(names.filter((name) => !mentionsCodeSpan(page, name))).toEqual([]);
  });
});
