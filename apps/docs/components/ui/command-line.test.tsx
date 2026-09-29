import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HighlightedCommand } from "./command-line";

describe("HighlightedCommand", () => {
  it("keeps every word of the command whole, so it wraps only at a space", () => {
    const html = renderToStaticMarkup(
      <HighlightedCommand
        command="npm install --save-dev @verbatra/cli"
        link={{ token: "@verbatra/cli", href: "https://www.npmjs.com/package/@verbatra/cli" }}
      />,
    );

    expect(html).toContain('<span class="whitespace-nowrap">--save-dev</span> <a');
    expect(html).toContain(">@verbatra/cli</a>");
  });

  it("keeps the words whole without a link too", () => {
    expect(renderToStaticMarkup(<HighlightedCommand command="bun add --dev x" />)).toBe(
      '<span class="whitespace-nowrap">bun</span> <span class="whitespace-nowrap">add</span> <span class="whitespace-nowrap">--dev</span> <span class="whitespace-nowrap">x</span>',
    );
  });
});
