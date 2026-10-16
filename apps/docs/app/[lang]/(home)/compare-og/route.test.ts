import { describe, expect, it, vi } from "vitest";

const getTranslationsMock = vi.fn(async ({ namespace }: { namespace: string }) => {
  const t = (key: string) => `${namespace}.${key}`;
  return t;
});

vi.mock("next-intl/server", () => ({ getTranslations: getTranslationsMock }));

const { GET } = await import("./route");

function request(lang: string) {
  return GET(new Request("http://localhost/compare-og"), { params: Promise.resolve({ lang }) });
}

describe("GET /[lang]/compare-og", () => {
  it.each(["en", "de"])("returns a 200 image response for %s", async (lang) => {
    const response = await request(lang);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("reads only the comparison heading, in the requested locale", async () => {
    getTranslationsMock.mockClear();
    await request("fr");
    expect(getTranslationsMock.mock.calls).toEqual([[{ locale: "fr", namespace: "compare" }]]);
  });
});
