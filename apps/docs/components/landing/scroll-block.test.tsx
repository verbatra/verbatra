import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScrollBlock } from "./scroll-block";

describe("ScrollBlock", () => {
  it("is a focusable group named by its caption, never a landmark", () => {
    const html = renderToStaticMarkup(
      <ScrollBlock labelledBy="caption" lang="en" data-check-output className="font-mono">
        <pre>line</pre>
      </ScrollBlock>,
    );
    expect(html).toBe(
      '<div role="group" tabindex="0" aria-labelledby="caption" lang="en" data-check-output="true" class="vk-scroll-fade font-mono"><pre>line</pre></div>',
    );
  });

  it("takes its name from labelledBy alone, forwarding no attribute it does not declare", () => {
    const stray = {
      "aria-labelledby": "other",
      "aria-label": "Other",
    } as unknown as { labelledBy: string };
    const html = renderToStaticMarkup(
      <ScrollBlock {...stray} labelledBy="caption" data-artifact="diff">
        line
      </ScrollBlock>,
    );
    expect(html).toBe(
      '<div role="group" tabindex="0" aria-labelledby="caption" data-artifact="diff" class="vk-scroll-fade">line</div>',
    );
  });
});
