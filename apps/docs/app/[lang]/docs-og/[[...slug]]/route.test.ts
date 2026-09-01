import { describe, expect, it, vi } from "vitest";

interface FakePage {
  readonly data: { readonly title: string; readonly description: string };
}

const PAGES: Record<string, Record<string, FakePage>> = {
  en: {
    "the-lock-file": {
      data: { title: "The lock file", description: "How verbatra.lock.json works." },
    },
  },
  de: {
    "the-lock-file": {
      data: { title: "Die Lock-Datei", description: "Wie verbatra.lock.json funktioniert." },
    },
  },
};

vi.mock("@/lib/source", () => ({
  source: {
    getPage: (slugs: readonly string[] | undefined, locale: string) =>
      PAGES[locale]?.[(slugs ?? []).join("/")],
  },
}));

const { GET } = await import("./route");

function request(slug: string[] | undefined, lang: string) {
  return GET(new Request("http://localhost/docs-og"), {
    params: Promise.resolve({ slug, lang }),
  });
}

describe("GET /[lang]/docs-og/[[...slug]]", () => {
  it("returns a 200 image response for a page that exists in the requested locale", async () => {
    const response = await request(["the-lock-file"], "en");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("returns a 200 image response for a non-default locale", async () => {
    const response = await request(["the-lock-file"], "de");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("returns 404 for a slug with no matching page", async () => {
    const response = await request(["does-not-exist"], "en");
    expect(response.status).toBe(404);
  });
});
