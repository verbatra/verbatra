// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: keyof typeof en.docs.versionPicker) =>
    en.docs.versionPicker[key],
}));

vi.mock("@/components/docs-callout", () => ({
  DocsCallout: ({ title, children }: { title: string; children: string }) => (
    <aside>
      <strong>{title}</strong>
      <p>{children}</p>
    </aside>
  ),
}));

const { VersionNotice, VERSION_NOTICE_CLASS } = await import("./version-notice");

describe("VersionNotice", () => {
  it("renders the static copy inside the element the stylesheet reveals, naming no version", async () => {
    const doc = new DOMParser().parseFromString(
      renderToStaticMarkup(await VersionNotice({ locale: "en" })),
      "text/html",
    );
    const notice = doc.querySelector(`.${VERSION_NOTICE_CLASS}`);
    expect(notice?.textContent).toContain(en.docs.versionPicker.noticeTitle);
    expect(notice?.textContent).toContain(en.docs.versionPicker.noticeText);
    expect(notice?.textContent).not.toMatch(/\d+\.\d+/);
  });
});
