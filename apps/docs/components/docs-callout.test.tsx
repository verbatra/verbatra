// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => (key === "note" ? "Hinweis" : "Warnung"),
}));

const { DocsCallout } = await import("./docs-callout");

async function render(props: { type?: string; title?: string }): Promise<string> {
  return renderToStaticMarkup(
    await DocsCallout({ locale: "de", ...props, children: "Body text" } as never),
  );
}

describe("DocsCallout", () => {
  it("gives an untitled info callout the localized note lead word", async () => {
    const markup = await render({});
    expect(markup).toContain("vk-callout");
    expect(markup).toContain(">Hinweis<");
  });

  it.each(["warn", "warning"])(
    "gives an untitled %s callout the warning lead word",
    async (type) => {
      expect(await render({ type })).toContain(">Warnung<");
    },
  );

  it("keeps a title the author wrote", async () => {
    const markup = await render({ type: "warn", title: "Two different maxTokens" });
    expect(markup).toContain(">Two different maxTokens<");
    expect(markup).not.toContain("Warnung");
  });

  it("adds no lead word to a type that has none", async () => {
    expect(await render({ type: "error" })).not.toMatch(/Hinweis|Warnung/);
  });
});
