import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { remarkLLMs } from "fumadocs-core/mdx-plugins/remark-llms";
import { describe, expect, it } from "vitest";
import {
  AI_SETUP_PROMPT,
  AI_SETUP_PROMPT_COMPONENT,
  AI_SETUP_PROMPT_MARKDOWN,
  remarkAiSetupPromptMarkdown,
} from "./ai-setup-prompt";
import { markdownUrl } from "./markdown-route";
import { SITE_URL } from "./site";

const LOCALES = ["", ".de", ".es", ".fr"];
const PROMPT_CHARACTER_LIMIT = 200;
const PROMPT_ELEMENT = `<${AI_SETUP_PROMPT_COMPONENT} />`;

function page(suffix: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../content/docs/(agents)/start-with-ai${suffix}.mdx`, import.meta.url)),
    "utf-8",
  );
}

type Node = {
  type: string;
  name?: string;
  depth?: number;
  value?: string;
  attributes?: unknown[];
  children?: Node[];
  data?: Record<string, unknown>;
};

function processedMarkdown(root: Node): string {
  remarkAiSetupPromptMarkdown()(root);
  const file: { data: { markdown?: string } } = { data: {} };
  const remarkLLMsWithoutProcessor = remarkLLMs as unknown as (options: {
    _data: boolean;
  }) => (tree: Node, file: unknown) => void;
  remarkLLMsWithoutProcessor({ _data: true })(root, file);
  return file.data.markdown ?? "";
}

describe("AI_SETUP_PROMPT", () => {
  it.each(LOCALES)(
    "is rendered by the one prompt component in start-with-ai%s.mdx, never copied into it",
    (suffix) => {
      const mdx = page(suffix);
      expect(mdx.split(PROMPT_ELEMENT)).toHaveLength(2);
      expect(mdx).not.toMatch(/```text\n/);
      for (const sentence of AI_SETUP_PROMPT.split(/(?<=\.) /)) {
        expect(mdx).not.toContain(sentence);
      }
    },
  );

  it("points the agent at the Markdown version of the setup page", () => {
    const url = `${SITE_URL}${markdownUrl("/docs/start-with-ai")}`;
    expect(AI_SETUP_PROMPT).toContain(` ${url} `);
  });

  it("keeps the spend gate, the key rule and the link-fail stop in the prompt itself, for an agent that cannot open the link", () => {
    expect(AI_SETUP_PROMPT).toContain("Spend nothing until I confirm.");
    expect(AI_SETUP_PROMPT).toContain("Never write or ask for an API key.");
    expect(AI_SETUP_PROMPT).toContain("If the link fails, stop.");
  });

  it("is one line, so the install box shows the whole text that Copy pastes", () => {
    expect(AI_SETUP_PROMPT).not.toMatch(/\n/);
    expect(AI_SETUP_PROMPT).toBe(AI_SETUP_PROMPT.trim());
  });

  it(`stays short enough to read at a glance (at most ${PROMPT_CHARACTER_LIMIT} characters)`, () => {
    expect(AI_SETUP_PROMPT.length).toBeLessThanOrEqual(PROMPT_CHARACTER_LIMIT);
  });
});

describe("remarkAiSetupPromptMarkdown", () => {
  it("gives the page's Markdown output the whole prompt as a text fence where the component sits", () => {
    const markdown = processedMarkdown({
      type: "root",
      children: [
        { type: "heading", depth: 2, children: [{ type: "text", value: "The prompt" }] },
        {
          type: "mdxJsxFlowElement",
          name: AI_SETUP_PROMPT_COMPONENT,
          attributes: [],
          children: [],
        },
        { type: "paragraph", children: [{ type: "text", value: "Then the steps." }] },
      ],
    });
    expect(markdown).toBe(`## The prompt\n\n${AI_SETUP_PROMPT_MARKDOWN}\n\nThen the steps.\n`);
    expect(AI_SETUP_PROMPT_MARKDOWN).toBe(`\`\`\`text\n${AI_SETUP_PROMPT}\n\`\`\``);
  });

  it("leaves every other component to the default Markdown output", () => {
    const other: Node = {
      type: "mdxJsxFlowElement",
      name: "Callout",
      attributes: [],
      children: [],
    };
    remarkAiSetupPromptMarkdown()({ type: "root", children: [other] });
    expect(other.data).toBeUndefined();
  });
});
