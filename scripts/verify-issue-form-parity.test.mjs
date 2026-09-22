import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUG_REPORT = ".github/ISSUE_TEMPLATE/bug_report.yml";
const NOT_APPLICABLE = "Not applicable";
const CUSTOM_ADAPTER = "A custom third-party adapter (custom:...)";

function readRepoFile(relativePath) {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

function supportedFormats() {
  const source = readRepoFile("packages/core/src/model/supported-format.ts");
  const list = /export const SUPPORTED_FORMATS = \[([\s\S]*?)\] as const;/.exec(source)?.[1] ?? "";
  return [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function providerIds() {
  const source = readRepoFile("packages/sdk/src/config/provider-config.ts");
  const union =
    /export const providerConfigSchema = z\.discriminatedUnion\("id", \[([\s\S]*?)\n\]\);/.exec(
      source,
    )?.[1] ?? "";
  return [...union.matchAll(/id: z\.literal\("([^"]+)"\)/g)].map((match) => match[1]);
}

function dropdownOptions(id) {
  const form = readRepoFile(BUG_REPORT);
  const block = new RegExp(`\\n {4}id: ${id}\\n([\\s\\S]*?)(?:\\n {2}- type:|$)`).exec(form)?.[1];
  const options = /\n {6}options:\n((?: {8}- .*\n)+)/.exec(block ?? "")?.[1] ?? "";
  return [...options.matchAll(/^ {8}- (.*)$/gm)].map((match) => match[1].trim());
}

describe(`${BUG_REPORT} lists exactly what verbatra ships`, () => {
  it("reads a non-trivial format and provider set from the source", () => {
    expect(supportedFormats().length).toBeGreaterThanOrEqual(10);
    expect(providerIds().length).toBeGreaterThanOrEqual(5);
  });

  it("offers every built-in format, plus the not-applicable and custom-adapter choices", () => {
    expect(dropdownOptions("format")).toEqual([
      NOT_APPLICABLE,
      ...supportedFormats(),
      CUSTOM_ADAPTER,
    ]);
  });

  it("offers every provider, plus the not-applicable choice", () => {
    expect(dropdownOptions("provider")).toEqual([NOT_APPLICABLE, ...providerIds()]);
  });
});
