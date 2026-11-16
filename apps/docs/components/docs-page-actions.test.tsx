// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("fumadocs-ui/layouts/notebook/page", () => ({
  MarkdownCopyButton: (props: ComponentProps<"button">) => <button type="button" {...props} />,
  ViewOptionsPopover: () => <span />,
}));

const { DocsPageActions } = await import("./docs-page-actions");

describe("DocsPageActions analytics marker", () => {
  it("marks the markdown copy button as the page-markdown surface", () => {
    const doc = new DOMParser().parseFromString(
      renderToStaticMarkup(<DocsPageActions markdownUrl="/docs.md" />),
      "text/html",
    );
    expect(doc.querySelector("button")?.getAttribute("data-copy-surface")).toBe("page-markdown");
  });
});
