import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { remarkInclude } from "fumadocs-mdx/config";
import { describe, expect, it } from "vitest";
import sourceConfig from "@/source.config";
import { llmMarkdown, type RemarkPlugins } from "@/test-support/llm-markdown";
import {
  expandStackBlocks,
  remarkStackBlocks,
  type StackMdxNode,
  supportedFormatIds,
  titleMeta,
} from "./stack-blocks";
import {
  initCommand,
  installLang,
  STACK_BLOCK_NAMES,
  STACK_IDS,
  STACKS,
  stackBlock,
  stackInitCommand,
  stackText,
} from "./stacks";

function element(
  type: "mdxJsxFlowElement" | "mdxJsxTextElement",
  name: string,
  attributes: Record<string, string>,
): StackMdxNode {
  return {
    type,
    name,
    attributes: Object.entries(attributes).map(([key, value]) => ({
      type: "mdxJsxAttribute",
      name: key,
      value,
    })),
    children: [],
  };
}

const STUB_TIMEOUT = 60_000;

function sourceFile(): { data: object } {
  return { data: {} };
}

function page(): StackMdxNode {
  return {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", value: "Your " },
          element("mdxJsxTextElement", "StackText", { field: "name" }),
          { type: "text", value: " app reads " },
          element("mdxJsxTextElement", "StackText", { field: "sourceFile" }),
        ],
      },
      {
        type: "mdxJsxFlowElement",
        name: "Steps",
        children: [element("mdxJsxFlowElement", "StackBlock", { name: "init" })],
      },
    ],
  };
}

function nodeTypes(node: StackMdxNode): string[] {
  return [node.type, ...(node.children ?? []).flatMap(nodeTypes)];
}

describe("expandStackBlocks", () => {
  it("expands a text field in place and a block into fenced code, nested in a component", () => {
    const root = page();
    expandStackBlocks(root, { stack: "react" }, sourceFile());
    expect(root.children?.[0]?.children).toEqual([
      { type: "text", value: "Your " },
      { type: "text", value: "React" },
      { type: "text", value: " app reads " },
      { type: "inlineCode", value: "locales/en.json" },
    ]);
    expect(root.children?.[1]?.children).toEqual([
      { type: "code", lang: "bash", meta: null, value: stackInitCommand(STACKS.react) },
    ]);
  });

  it("titles a file block with its path, so the code block is file-labelled", () => {
    const root: StackMdxNode = {
      type: "root",
      children: [element("mdxJsxFlowElement", "StackBlock", { name: "source-file" })],
    };
    expandStackBlocks(root, { stack: "flutter" }, sourceFile());
    expect(root.children?.[0]).toMatchObject({
      type: "code",
      lang: "json",
      meta: 'title="lib/l10n/app_en.arb"',
    });
  });

  it("refuses a title that would break out of its quoted meta attribute", () => {
    expect(titleMeta(undefined)).toBeNull();
    expect(titleMeta("src/main.tsx")).toBe('title="src/main.tsx"');
    expect(() => titleMeta('a" onclick="x')).toThrow(/double quote/);
    for (const id of STACK_IDS) {
      for (const name of STACK_BLOCK_NAMES) {
        for (const { title } of stackBlock(STACKS[id], name)) {
          expect(() => titleMeta(title), `${id} ${name}`).not.toThrow();
        }
      }
    }
  });

  it.each(STACK_IDS)("never emits a heading for %s, so the TOC stays the template's", (id) => {
    const root: StackMdxNode = {
      type: "root",
      children: STACK_BLOCK_NAMES.map((name) =>
        element("mdxJsxFlowElement", "StackBlock", { name }),
      ),
    };
    expandStackBlocks(root, { stack: id }, sourceFile());
    expect(nodeTypes(root).filter((type) => type !== "root" && type !== "code")).toEqual([]);
  });

  it("leaves a page without a stack field and without stack elements untouched", () => {
    const root: StackMdxNode = { type: "root", children: [{ type: "text", value: "x" }] };
    expandStackBlocks(root, { title: "Page" }, sourceFile());
    expect(root).toEqual({ type: "root", children: [{ type: "text", value: "x" }] });
  });

  it("refuses a stack element on a page that names no stack", () => {
    expect(() => expandStackBlocks(page(), { title: "Page" }, sourceFile())).toThrow(
      /"stack" frontmatter/,
    );
  });

  it("refuses an unknown stack, block name or text field", () => {
    expect(() => expandStackBlocks(page(), { stack: "svelte" }, sourceFile())).toThrow(
      /Unknown stack/,
    );
    const badBlock: StackMdxNode = {
      type: "root",
      children: [element("mdxJsxFlowElement", "StackBlock", { name: "nope" })],
    };
    expect(() => expandStackBlocks(badBlock, { stack: "vue" }, sourceFile())).toThrow(
      /needs a name/,
    );
    const badText: StackMdxNode = {
      type: "root",
      children: [element("mdxJsxTextElement", "StackText", { field: "nope" })],
    };
    expect(() => expandStackBlocks(badText, { stack: "vue" }, sourceFile())).toThrow(
      /needs a field/,
    );
  });

  it("reads the stack from the frontmatter fumadocs-mdx puts on the file", () => {
    const root = page();
    remarkStackBlocks()(root, { data: { frontmatter: { stack: "nextjs" } } });
    expect(root.children?.[0]?.children?.[1]).toEqual({ type: "text", value: "Next.js" });
  });
});

describe("InitCommand", () => {
  it("expands into the quickstart's init command on a page with no stack field", () => {
    const root: StackMdxNode = {
      type: "root",
      children: [element("mdxJsxFlowElement", "InitCommand", { format: "android-xml" })],
    };
    expandStackBlocks(root, { title: "Pick your stack" }, sourceFile());
    expect(root.children).toEqual([
      { type: "code", lang: "bash", meta: null, value: initCommand("android-xml") },
    ]);
    expect(initCommand(STACKS.vue.format)).toBe(stackInitCommand(STACKS.vue));
  });

  it.each(["a b", "toml", ""])("refuses %j, which is no supported format id", (format) => {
    const root: StackMdxNode = {
      type: "root",
      children: [element("mdxJsxFlowElement", "InitCommand", { format })],
    };
    expect(() => expandStackBlocks(root, {}, sourceFile())).toThrow(
      /needs a format id from i18next-json/,
    );
  });

  it("reads the supported format ids from the published config schema", () => {
    expect(supportedFormatIds()).toContain("android-xml");
    expect(supportedFormatIds()).toContain("arb");
    expect(supportedFormatIds()).not.toContain("custom:anything");
  });
});

describe("StackOnly", () => {
  function only(stacks: string): StackMdxNode {
    const node = element("mdxJsxFlowElement", "StackOnly", { stacks });
    node.children = [
      {
        type: "paragraph",
        children: [element("mdxJsxTextElement", "StackText", { field: "name" })],
      },
    ];
    return { type: "root", children: [node] };
  }

  it("keeps its expanded children on a listed stack and drops them on every other", () => {
    const flutter = only("flutter");
    expandStackBlocks(flutter, { stack: "flutter" }, sourceFile());
    expect(flutter.children).toEqual([
      { type: "paragraph", children: [{ type: "text", value: "Flutter" }] },
    ]);
    const react = only("flutter");
    expandStackBlocks(react, { stack: "react" }, sourceFile());
    expect(react.children).toEqual([]);
  });

  it("refuses an unknown stack id and a page that names no stack", () => {
    expect(() => expandStackBlocks(only("svelte"), { stack: "react" }, sourceFile())).toThrow(
      /StackOnly/,
    );
    expect(() => expandStackBlocks(only("flutter"), {}, sourceFile())).toThrow(
      /"stack" frontmatter/,
    );
  });
});

describe("the runtime install block", () => {
  it.each([
    ["react", "npm"],
    ["nextjs", "npm"],
    ["vue", "npm"],
    ["angular", "npm"],
    ["flutter", "bash"],
  ] as const)("renders %s's install as a %s fence", (id, lang) => {
    const [block] = stackBlock(STACKS[id], "runtime-install");
    expect(block?.lang).toBe(lang);
  });

  it("tabs only an npm install, never another npm command", () => {
    expect(installLang("npm install vue-i18n")).toBe("npm");
    expect(installLang("npm run build")).toBe("bash");
    expect(installLang("npx @verbatra/cli check")).toBe("bash");
  });
});

describe("the .md output of a stack page", () => {
  function markdownOf(value: string, stack?: string): Promise<string> {
    const frontmatter = stack === undefined ? {} : { stack };
    return llmMarkdown({ value, data: { frontmatter } }, [remarkStackBlocks]);
  }

  it("writes each StackText as the stack's own text, code fields as inline code", async () => {
    const markdown = await markdownOf(
      'Your <StackText field="name" /> app reads <StackText field="sourceFile" />.\n',
      "react",
    );
    expect(markdown).toBe(
      `Your ${stackText(STACKS.react, "name")} app reads \`${stackText(STACKS.react, "sourceFile")}\`.\n`,
    );
  });

  it("writes a StackBlock as the stack's fenced code blocks", async () => {
    const markdown = await markdownOf('<StackBlock name="init" />\n', "vue");
    const fences = stackBlock(STACKS.vue, "init").map(({ lang, title, code }) =>
      [`\`\`\`${[lang, titleMeta(title)].filter(Boolean).join(" ")}`, code, "```"].join("\n"),
    );
    expect(markdown).not.toContain("StackBlock");
    expect(markdown).toBe(`${fences.join("\n\n")}\n`);
  });

  it("writes an npm install StackBlock as the npm command alone, like a hand-written npm fence", async () => {
    const markdown = await markdownOf('<StackBlock name="runtime-install" />\n', "vue");
    expect(markdown).toBe(`\`\`\`bash\n${STACKS.vue.runtimeInstall}\n\`\`\`\n`);
    expect(installLang(STACKS.vue.runtimeInstall)).toBe("npm");
  });

  it("writes an InitCommand as a bash fence holding the quickstart's init command", async () => {
    expect(await markdownOf('<InitCommand format="arb" />\n')).toBe(
      `\`\`\`bash\n${initCommand("arb")}\n\`\`\`\n`,
    );
  });

  it("keeps a StackOnly's expanded children on a listed stack and drops them on every other", async () => {
    const value =
      'A\n\n<StackOnly stacks="flutter">\n  On <StackText field="name" />.\n</StackOnly>\n\nB\n';
    expect(await markdownOf(value, "flutter")).toBe(
      `A\n\nOn ${stackText(STACKS.flutter, "name")}.\n\nB\n`,
    );
    expect(await markdownOf(value, "react")).toBe("A\n\n\n\nB\n");
  });
});

function sourceRemarkPlugins(): RemarkPlugins {
  const options = sourceConfig.mdxOptions;
  const plugins = typeof options === "object" ? options.remarkPlugins : undefined;
  if (!Array.isArray(plugins)) throw new Error("source.config.ts sets no remarkPlugins list");
  return plugins;
}

describe("the .md output of a real stack quickstart stub", () => {
  const STUB = fileURLToPath(
    new URL("../content/docs/(get-started)/quickstart/vue.mdx", import.meta.url),
  );

  async function stubMarkdown(): Promise<string> {
    const source = readFileSync(STUB, "utf8");
    const [, frontmatter = "", body = ""] =
      /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source) ?? [];
    const stack = /^stack: (\S+)$/m.exec(frontmatter)?.[1];
    expect(stack).toBe("vue");
    const remarkPlugins = sourceRemarkPlugins();
    return llmMarkdown({ value: body, path: STUB, data: { frontmatter: { stack } } }, [
      remarkInclude,
      ...remarkPlugins,
    ]);
  }

  it(
    "leaves no stack or init tag behind and writes the runtime install as a bash fence",
    async () => {
      const markdown = await stubMarkdown();
      expect(markdown).not.toContain("<include");
      expect(markdown).not.toMatch(/<Stack/);
      expect(markdown).not.toMatch(/<InitCommand/);
      expect(markdown).not.toContain("```npm");
      expect(markdown).toContain(`\`\`\`bash\n${STACKS.vue.runtimeInstall}\n\`\`\``);
    },
    STUB_TIMEOUT,
  );
});
