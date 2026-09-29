import type { TOCItemType } from "fumadocs-core/toc";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { onThisPageLabel, pageToc } from "./page-toc";

const toc: TOCItemType[] = [
  { title: "CLI error codes", url: "#cli-error-codes", depth: 2 },
  { title: "AGENT_FILE_INVALID", url: "#agent_file_invalid", depth: 3 },
  { title: "Run notices", url: "#sdk-notice-codes", depth: 2 },
];

describe("pageToc", () => {
  it("keeps every heading when no depth limit is set", () => {
    expect(pageToc(toc).map((item) => item.url)).toEqual([
      "#cli-error-codes",
      "#agent_file_invalid",
      "#sdk-notice-codes",
    ]);
  });

  it("offers a line break after each underscore of a title", () => {
    expect(renderToStaticMarkup(<>{pageToc(toc)[1]?.title}</>)).toBe(
      "AGENT_<wbr/>FILE_<wbr/>INVALID",
    );
  });

  it("drops the headings below the depth limit", () => {
    expect(pageToc(toc, 2).map((item) => item.url)).toEqual([
      "#cli-error-codes",
      "#sdk-notice-codes",
    ]);
  });
});

describe("onThisPageLabel", () => {
  it("names the table of contents in the page locale", () => {
    expect(onThisPageLabel("en")).toBe("On this page");
    expect(onThisPageLabel("de")).toBe("Auf dieser Seite");
  });
});
