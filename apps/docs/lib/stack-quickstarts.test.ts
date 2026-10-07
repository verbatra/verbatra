import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readIncludedSource } from "./docs-pages";
import { i18n } from "./i18n";
import { FRONTMATTER, pageType, proseWords, WORD_CEILING } from "./page-type";
import {
  STACK_BLOCK_NAMES,
  STACK_IDS,
  STACK_TEXT_FIELDS,
  STACKS,
  type StackId,
  stackBlock,
  stackText,
} from "./stacks";

const DOCS_DIR = join(import.meta.dirname, "..");
const CONTENT_DIR = join(DOCS_DIR, "content/docs");
const QUICKSTART_DIR = join(CONTENT_DIR, "(get-started)/quickstart");
const TEMPLATES_DIR = join(DOCS_DIR, "content/templates");
const SUFFIXES = i18n.languages.map((locale) =>
  locale === i18n.defaultLanguage ? "" : `.${locale}`,
);
const STACK_ELEMENT = /<Stack(Block|Text) (name|field)="([^"]*)" \/>/g;
const MIN_STEPS = 4;
const MAX_STEPS = 8;

function stubPath(id: string, suffix: string): string {
  return join(QUICKSTART_DIR, `${id}${suffix}.mdx`);
}

function templatePath(suffix: string): string {
  return join(TEMPLATES_DIR, `stack-quickstart${suffix}.mdx`);
}

function frontmatterField(source: string, field: string): string | undefined {
  const frontmatter = FRONTMATTER.exec(source)?.[1] ?? "";
  return new RegExp(`^${field}:\\s*(\\S+)\\s*$`, "m").exec(frontmatter)?.[1];
}

function stackElements(source: string): string[] {
  return [...source.matchAll(STACK_ELEMENT)].map(([, kind, , value]) => `${kind}:${value}`);
}

function rendered(id: StackId, suffix: string): string {
  const stack = STACKS[id];
  return readIncludedSource(stubPath(id, suffix)).replace(
    STACK_ELEMENT,
    (_match, kind: string, _attribute: string, value: string) => {
      if (kind === "Text") return stackText(stack, value as (typeof STACK_TEXT_FIELDS)[number]);
      return stackBlock(stack, value as (typeof STACK_BLOCK_NAMES)[number])
        .map(({ lang, code }) => `\`\`\`${lang}\n${code}\n\`\`\``)
        .join("\n\n");
    },
  );
}

const STACK_PAGE_LINK = /(?:href: "|\]\()\/docs\/quickstart\/([a-z]+)[")]/g;

function linkedStackPages(file: string): string[] {
  const source = readFileSync(join(CONTENT_DIR, file), "utf8");
  return [...source.matchAll(STACK_PAGE_LINK)].map(([, id = ""]) => id);
}

describe("the stack quickstart templates", () => {
  it.each(SUFFIXES)("exist for every locale (stack-quickstart%s.mdx)", (suffix) => {
    expect(existsSync(templatePath(suffix))).toBe(true);
  });

  it("are the only files in the templates folder", () => {
    expect(readdirSync(TEMPLATES_DIR).sort()).toEqual(
      SUFFIXES.map((suffix) => `stack-quickstart${suffix}.mdx`).sort(),
    );
  });

  it.each(SUFFIXES)("use only known blocks and fields, in the English order (%s)", (suffix) => {
    const english = stackElements(readFileSync(templatePath(""), "utf8"));
    const elements = stackElements(readFileSync(templatePath(suffix), "utf8"));
    expect(elements).toEqual(english);
    for (const element of elements) {
      const [kind, value = ""] = element.split(":");
      const known: readonly string[] = kind === "Block" ? STACK_BLOCK_NAMES : STACK_TEXT_FIELDS;
      expect(known, element).toContain(value);
    }
  });

  it("carry no page-level badge, which the nested include would hide from the sidebar NEW status", () => {
    for (const suffix of SUFFIXES) {
      const template = readFileSync(templatePath(suffix), "utf8");
      const lead = template.slice(0, template.search(/^## /m));
      expect(lead, suffix).not.toMatch(/<AvailableFrom\b/);
    }
  });

  it("place no stack element inside a heading", () => {
    for (const suffix of SUFFIXES) {
      const headings = readFileSync(templatePath(suffix), "utf8")
        .split("\n")
        .filter((line) => line.startsWith("#"));
      expect(headings.filter((line) => line.includes("<Stack"))).toEqual([]);
    }
  });
});

describe("the stack quickstart pages", () => {
  it("are exactly one stub per stack and locale, besides the generic quickstart", () => {
    const expected = [
      ...SUFFIXES.map((suffix) => `index${suffix}.mdx`),
      ...STACK_IDS.flatMap((id) => SUFFIXES.map((suffix) => `${id}${suffix}.mdx`)),
      ...SUFFIXES.map((suffix) => `meta${suffix}.json`),
    ].sort();
    expect(readdirSync(QUICKSTART_DIR).sort()).toEqual(expected);
  });

  describe.each(STACK_IDS)("%s", (id) => {
    it.each(SUFFIXES)("names its stack and includes the template of its locale (%s)", (suffix) => {
      const source = readFileSync(stubPath(id, suffix), "utf8");
      expect(frontmatterField(source, "stack")).toBe(id);
      expect(pageType(source)).toBe("tutorial");
      expect(source.replace(FRONTMATTER, "")).toBe(
        `<include>../../../templates/stack-quickstart${suffix}.mdx</include>\n`,
      );
    });

    it.each(SUFFIXES)("has between four and eight steps (%s)", (suffix) => {
      const steps = rendered(id, suffix).match(/^<Step>$/gm) ?? [];
      expect(steps.length).toBeGreaterThanOrEqual(MIN_STEPS);
      expect(steps.length).toBeLessThanOrEqual(MAX_STEPS);
    });

    it("stays under the tutorial ceiling with its stack text filled in", () => {
      expect(proseWords(rendered(id, ""))).toBeLessThanOrEqual(WORD_CEILING.tutorial);
    });

    it("runs the generic skeleton in order, with the agent setup after the steps", () => {
      const page = rendered(id, "");
      const commands = [...page.matchAll(/^npx @verbatra\/cli (.+)$/gm)].map(
        ([, command]) => command,
      );
      expect(commands).toEqual([
        `init --format ${STACKS[id].format} --provider gemini --yes`,
        "translate --dry-run",
        "translate",
        "check",
        "init --agent",
      ]);
      expect(page.indexOf("init --agent")).toBeGreaterThan(page.indexOf("</Steps>"));
      expect(page.match(/^```npm\nnpm install --save-dev @verbatra\/cli$/gm)).toHaveLength(1);
    });

    it("runs the same commands as the generic quickstart, in the same order", () => {
      const generic = readFileSync(join(QUICKSTART_DIR, "index.mdx"), "utf8");
      const steps = (page: string) =>
        [...page.matchAll(/^npx @verbatra\/cli (init|translate|check)\b(?: --dry-run)?/gm)].map(
          ([command]) => command,
        );
      const stackSteps = steps(rendered(id, "").split("</Steps>")[0] ?? "");
      expect(stackSteps).toEqual(steps(generic));
    });

    it.each(["index", "(get-started)/pick-your-stack", "(get-started)/quickstart/index"])(
      "is linked from %s",
      (page) => {
        for (const suffix of SUFFIXES) {
          expect(linkedStackPages(`${page}${suffix}.mdx`), suffix).toContain(id);
        }
      },
    );
  });

  it.each(["index", "(get-started)/pick-your-stack", "(get-started)/quickstart/index"])(
    "links nothing on %s to a missing stack page",
    (page) => {
      for (const suffix of SUFFIXES) {
        for (const id of linkedStackPages(`${page}${suffix}.mdx`)) {
          expect(STACK_IDS, `${page}${suffix}`).toContain(id);
        }
      }
    },
  );
});
