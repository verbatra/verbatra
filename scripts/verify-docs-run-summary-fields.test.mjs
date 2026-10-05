import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_DIR = resolve(REPO_ROOT, "apps/docs/content/docs");
const SDK_DECLARATIONS = resolve(REPO_ROOT, "packages/sdk/dist/index.d.ts");
const OWNER = "sdk/run-summary";
const LOCALE_SUFFIXES = ["", ".de", ".es", ".fr"];
const INTERFACES = ["RunSummary", "LocaleSummary"];

function interfaceBody(source, name) {
  const body = new RegExp(`^(?:declare )?interface ${name} \\{\\n([\\s\\S]*?)^\\}`, "m").exec(
    source,
  )?.[1];
  if (body === undefined) throw new Error(`interface ${name} could not be located`);
  return body;
}

function declaredFields(name) {
  const body = interfaceBody(readFileSync(SDK_DECLARATIONS, "utf8"), name);
  return [...body.matchAll(/^ {4}(?:readonly )?(\w+)(\??):/gm)]
    .map(([, field, optional]) => `${field}${optional}`)
    .sort();
}

function documentedFields(source, name) {
  const body = interfaceBody(source, name);
  return [...body.matchAll(/^ {2}(\w+)(\??):/gm)]
    .map(([, field, optional]) => `${field}${optional}`)
    .sort();
}

function readPage(page, suffix) {
  return readFileSync(resolve(CONTENT_DIR, `${page}${suffix}.mdx`), "utf8");
}

function pagesPrintingRunSummary() {
  return readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".mdx"))
    .filter((file) =>
      /^interface RunSummary \{$/m.test(readFileSync(resolve(CONTENT_DIR, file), "utf8")),
    )
    .map((file) => file.replace(/\.(de|es|fr)\.mdx$/, "").replace(/\.mdx$/, ""))
    .filter((page, index, pages) => pages.indexOf(page) === index)
    .sort();
}

describe("the RunSummary anatomy lists exactly the published fields", () => {
  it("reads non-trivial field lists, so the comparison cannot pass vacuously", () => {
    expect(declaredFields("RunSummary")).toEqual(
      expect.arrayContaining(["dryRun", "locales", "cancelled?"]),
    );
    expect(declaredFields("LocaleSummary").length).toBeGreaterThanOrEqual(20);
    expect(declaredFields("LocaleSummary")).toContain("emptySource?");
  });

  it.each(LOCALE_SUFFIXES.flatMap((suffix) => INTERFACES.map((name) => [suffix, name])))(
    "run-summary%s.mdx prints every %s field with its optionality",
    (suffix, name) => {
      expect(documentedFields(readPage(OWNER, suffix), name)).toEqual(declaredFields(name));
    },
  );

  it("sees a dropped field and a field whose optionality drifted", () => {
    const page = readPage(OWNER, "");
    const dropped = page.replace(/^ {2}emptySource\?:.*\n/m, "");
    const required = page.replace(/^ {2}cancelled\?:/m, "  cancelled:");

    expect(documentedFields(dropped, "LocaleSummary")).not.toContain("emptySource?");
    expect(documentedFields(required, "RunSummary")).not.toEqual(declaredFields("RunSummary"));
  });

  it("leaves the field list to its one owner page", () => {
    expect(pagesPrintingRunSummary()).toEqual([OWNER]);
  });
});
