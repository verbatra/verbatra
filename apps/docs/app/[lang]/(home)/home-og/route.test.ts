import { createTranslator } from "next-intl";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import { stripAccentTags } from "@/test-support/accent-tags";

const captured = vi.hoisted(() => ({ element: undefined as ReactElement | undefined }));

const getTranslationsMock = vi.fn(async ({ namespace }: { namespace: string }) =>
  createTranslator({ locale: "en", messages: en, namespace: namespace as never }),
);

vi.mock("next-intl/server", () => ({ getTranslations: getTranslationsMock }));

vi.mock("next/og", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/og")>();
  class CapturingImageResponse extends actual.ImageResponse {
    constructor(...args: ConstructorParameters<typeof actual.ImageResponse>) {
      super(...args);
      captured.element = args[0] as ReactElement;
    }
  }
  return { ...actual, ImageResponse: CapturingImageResponse };
});

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

  it("reads only the landing headline, in the requested locale", async () => {
    getTranslationsMock.mockClear();
    await request("de");
    expect(getTranslationsMock.mock.calls).toEqual([
      [{ locale: "de", namespace: "landing.banner" }],
    ]);
  });

  it("hands the frame the headline as plain text with the accent markup applied", async () => {
    await request("en");
    const props = captured.element?.props as { headline: string } | undefined;
    const headline = props?.headline;
    expect(headline).toBe(stripAccentTags(en.landing.banner.headline));
    expect(headline).not.toContain("<accent>");
  });
});
