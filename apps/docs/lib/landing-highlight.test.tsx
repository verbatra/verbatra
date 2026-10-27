import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { highlightLandingCode, LANDING_CODE_THEMES } from "./landing-highlight";

async function html(code: string, lang: Parameters<typeof highlightLandingCode>[1]) {
  return renderToStaticMarkup(await highlightLandingCode(code, lang));
}

describe("highlightLandingCode", () => {
  it("renders the Fumadocs dual themes as custom properties with no default color", async () => {
    const markup = await html("command: check\n", "yaml");
    expect(LANDING_CODE_THEMES).toEqual({ light: "github-light", dark: "github-dark" });
    expect(markup).toContain('class="shiki shiki-themes github-light github-dark"');
    expect(markup).toMatch(/<span style="--shiki-light:#[0-9a-f]{6};--shiki-dark:#[0-9a-f]{6}"/i);
    expect(markup).not.toMatch(/style="color:/);
  });

  it("drops the trailing newline so no empty last line renders", async () => {
    const markup = await html("npx @verbatra/cli check\n\n", "bash");
    expect(markup.match(/class="line"/g)).toHaveLength(1);
  });

  it("emits no script and no event handler, only inline style attributes", async () => {
    const markup = await html('const a = "<script>alert(1)</script>";', "ts");
    expect(markup).not.toContain("<script");
    expect(markup).not.toMatch(/\son[a-z]+=/i);
    expect(markup).toContain("&lt;script&gt;");
  });
});
