import { describe, expect, it, vi } from "vitest";

const getTranslationsMock = vi.fn(async ({ namespace }: { namespace: string }) => {
  const t = (key: string) => `${namespace}.${key}`;
  return t;
});

vi.mock("next-intl/server", () => ({ getTranslations: getTranslationsMock }));

const { GET } = await import("./route");

function request(lang: string) {
  return GET(new Request("http://localhost/home-og"), { params: Promise.resolve({ lang }) });
}

describe("GET /[lang]/home-og", () => {
  it("returns a 200 image response for the default locale", async () => {
    const response = await request("en");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("returns a 200 image response for a non-default locale", async () => {
    const response = await request("de");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("resolves translations from the landing.meta namespace for the requested locale", async () => {
    getTranslationsMock.mockClear();
    await request("de");
    expect(getTranslationsMock).toHaveBeenCalledWith({
      locale: "de",
      namespace: "landing.meta",
    });
  });
});
