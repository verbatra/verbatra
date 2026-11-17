// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("fumadocs-ui/components/codeblock", () => ({
  CodeBlock: ({ Actions }: { Actions: (props: ComponentProps<"div">) => React.ReactNode }) => (
    <Actions>
      <button type="button">copy</button>
    </Actions>
  ),
}));

const { DocsCodeBlock } = await import("./docs-code-block");

describe("DocsCodeBlock analytics marker", () => {
  it("marks the actions region around the copy button as the code-block surface", () => {
    const doc = new DOMParser().parseFromString(
      renderToStaticMarkup(<DocsCodeBlock>code</DocsCodeBlock>),
      "text/html",
    );
    expect(
      doc
        .querySelector("button")
        ?.closest("[data-copy-surface]")
        ?.getAttribute("data-copy-surface"),
    ).toBe("code-block");
  });
});
