import type { TOCItemType } from "fumadocs-core/toc";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { breakAfterUnderscores, pageToc } from "./page-toc";

const toc: TOCItemType[] = [
  { title: "CLI error codes", url: "#cli-error-codes", depth: 2 },
  { title: "AGENT_FILE_INVALID", url: "#agent_file_invalid", depth: 3 },
  { title: "Run notices", url: "#sdk-notice-codes", depth: 2 },
];

function markup(title: TOCItemType["title"]): string {
  return renderToStaticMarkup(<>{title}</>);
}

describe("breakAfterUnderscores", () => {
  it("offers a line break only after each underscore", () => {
    expect(markup(breakAfterUnderscores("AGENT_FILE_INVALID"))).toBe(
      "AGENT_<wbr/>FILE_<wbr/>INVALID",
    );
  });

  it("leaves a title without underscores or a non-string title as it is", () => {
    const element = <code>translate</code>;
    expect(breakAfterUnderscores("Run notices")).toBe("Run notices");
    expect(breakAfterUnderscores(element)).toBe(element);
  });
});

describe("pageToc", () => {
  it("keeps every heading when no depth limit is set", () => {
    expect(pageToc(toc).map((item) => item.url)).toEqual([
      "#cli-error-codes",
      "#agent_file_invalid",
      "#sdk-notice-codes",
    ]);
  });

  it("drops the headings below the depth limit", () => {
    expect(pageToc(toc, 2).map((item) => item.url)).toEqual([
      "#cli-error-codes",
      "#sdk-notice-codes",
    ]);
  });
});
