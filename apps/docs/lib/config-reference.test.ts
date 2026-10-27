import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { i18n } from "./i18n";

type SchemaNode = {
  properties?: Record<string, SchemaNode>;
  oneOf?: SchemaNode[];
  const?: unknown;
};

const CONTENT_DIR = join(import.meta.dirname, "../content/docs");
const KEY_ENV_VARS = join(
  import.meta.dirname,
  "../../../packages/ai-providers/src/key-env-vars.ts",
);
const PROVIDER_OPTIONS = "provider.options";
const SUFFIXES = i18n.languages.map((locale) =>
  locale === i18n.defaultLanguage ? "" : `.${locale}`,
);

const schema = JSON.parse(
  readFileSync(createRequire(import.meta.url).resolve("@verbatra/sdk/config-schema.json"), "utf8"),
) as SchemaNode;

function readPage(name: string, suffix: string): string {
  return readFileSync(join(CONTENT_DIR, `(configure)/${name}${suffix}.mdx`), "utf8");
}

function objectMembers(node: SchemaNode): SchemaNode[] {
  if (node.properties !== undefined) return [node];
  const members = node.oneOf ?? [];
  return members.length > 0 && members.every((member) => member.properties !== undefined)
    ? members
    : [];
}

function childKeys(node: SchemaNode): Map<string, SchemaNode[]> {
  const children = new Map<string, SchemaNode[]>();
  for (const member of objectMembers(node)) {
    for (const [key, child] of Object.entries(member.properties ?? {})) {
      children.set(key, [...(children.get(key) ?? []), child]);
    }
  }
  return children;
}

function leafPaths(node: SchemaNode, prefix = ""): string[] {
  return [...childKeys(node)].flatMap(([key, children]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    const nested =
      path === PROVIDER_OPTIONS ? [] : children.flatMap((child) => leafPaths(child, path));
    return nested.length > 0 ? [...new Set(nested)] : [path];
  });
}

function providerOptions(): Map<string, string[]> {
  const members = schema.properties?.provider?.oneOf ?? [];
  return new Map(
    members.map((member) => [
      String(member.properties?.id?.const),
      Object.keys(member.properties?.options?.properties ?? {}),
    ]),
  );
}

function hostedKeyVariables(): Map<string, string> {
  const source = readFileSync(KEY_ENV_VARS, "utf8");
  const table = /export const PROVIDER_ENV = \{([\s\S]*?)\} as const;/.exec(source)?.[1] ?? "";
  return new Map(
    [...table.matchAll(/^\s+"?([a-z-]+)"?: "([A-Z_]+)",$/gm)].map((match) => [
      match[1] ?? "",
      match[2] ?? "",
    ]),
  );
}

function outsideFences(page: string): string[] {
  let fenced = false;
  return page.split("\n").filter((line) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      return false;
    }
    return !fenced;
  });
}

function tables(lines: readonly string[]): string[][] {
  const found: string[][] = [];
  let current: string[] = [];
  for (const line of [...lines, ""]) {
    if (line.startsWith("|")) {
      current.push(line);
    } else if (current.length > 0) {
      found.push(current);
      current = [];
    }
  }
  return found;
}

function firstCellCode(row: string): string | undefined {
  const cell = row.replace(/^\| /, "").split(" | ")[0] ?? "";
  return /`([^`]+)`/.exec(cell)?.[1];
}

function rowKeys(table: readonly string[]): string[] {
  return table
    .slice(2)
    .map(firstCellCode)
    .filter((key): key is string => key !== undefined);
}

function documentedConfigKeys(page: string): string[] {
  const table = tables(outsideFences(page)).find((rows) => rowKeys(rows).includes("sourceLocale"));
  return table === undefined ? [] : rowKeys(table);
}

function providerSection(page: string, id: string): string | undefined {
  return page
    .split(/^## /m)
    .slice(1)
    .map((section) => section.split(/^### /m)[0] ?? "")
    .find((section) => section.includes(`id: "${id}"`));
}

function documentedOptions(page: string, id: string): string[] {
  const section = providerSection(page, id) ?? "";
  const [first] = tables(outsideFences(section));
  return first === undefined ? [] : rowKeys(first);
}

describe("the config file reference documents every config key once", () => {
  const keys = leafPaths(schema);

  it("reads every key path from the emitted JSON Schema", () => {
    expect(keys).toEqual(
      expect.arrayContaining([
        "sourceLocale",
        "files.pattern",
        "provider.id",
        PROVIDER_OPTIONS,
        "network.allowedHosts",
        "extract.unused.ignore",
      ]),
    );
    expect(keys).not.toContain("files");
    expect(keys).not.toContain("provider.options.model");
  });

  it.each(SUFFIXES)("lists each key exactly once in config-file%s.mdx", (suffix) => {
    const documented = documentedConfigKeys(readPage("config-file", suffix));

    expect([...documented].sort()).toEqual([...keys].sort());
  });

  it("sees a key that is missing or documented twice", () => {
    const page = readPage("config-file", "");
    const withoutTone = page.replace(/^\| `tone` \|.*\n/m, "");
    const twice = page.replace(/^(\| `tone` \|.*\n)/m, "$1$1");

    expect(documentedConfigKeys(withoutTone)).not.toContain("tone");
    expect([...documentedConfigKeys(twice)].sort()).not.toEqual([...keys].sort());
  });
});

describe("the providers reference documents every provider's options and key", () => {
  const options = providerOptions();
  const variables = hostedKeyVariables();

  it("reads the options of every provider and the hosted key variables", () => {
    expect(options.get("anthropic")).toContain("maxTokens");
    expect(options.get("none")).toEqual([]);
    expect(variables.get("deepl")).toBe("DEEPL_API_KEY");
  });

  it.each(SUFFIXES)("tables exactly each provider's options in providers%s.mdx", (suffix) => {
    const page = readPage("providers", suffix);
    for (const [id, expected] of options) {
      expect(providerSection(page, id), id).toBeDefined();
      expect([...documentedOptions(page, id)].sort(), id).toEqual([...expected].sort());
    }
  });

  it.each(SUFFIXES)("names each hosted provider's key variable in providers%s.mdx", (suffix) => {
    const page = readPage("providers", suffix);
    for (const [id, variable] of variables) {
      expect(providerSection(page, id), id).toContain(`\`${variable}\``);
    }
  });

  it("sees a dropped or invented option row", () => {
    const page = readPage("providers", "");
    const withoutGlossaryId = page.replace(/^\| `glossaryId` \|.*\n/m, "");
    const invented = page.replace(/^(\| `glossaryId` \|.*\n)/m, "$1| `formality` | x | x | x |\n");

    expect(documentedOptions(withoutGlossaryId, "deepl")).not.toContain("glossaryId");
    expect(documentedOptions(invented, "deepl")).toContain("formality");
  });
});
