// @vitest-environment jsdom

import { NextIntlClientProvider, useTranslations } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClientMessagesProvider } from "./client-messages";
import { withIntl } from "./intl-boundary";

function Label() {
  return <span>{useTranslations("docs.theme")("light")}</span>;
}

const Wrapped = withIntl(Label);

describe("withIntl", () => {
  it("formats with the landing's client messages, so the landing ships no intl provider in its first load", () => {
    const html = renderToStaticMarkup(
      <ClientMessagesProvider
        value={{ locale: "en", timeZone: "UTC", messages: { docs: { theme: { light: "Light" } } } }}
      >
        <Wrapped />
      </ClientMessagesProvider>,
    );
    expect(html).toBe("<span>Light</span>");
  });

  it("uses the provider above it on the docs and legal pages", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider
        locale="de"
        timeZone="UTC"
        messages={{ docs: { theme: { light: "Hell" } } }}
      >
        <Wrapped />
      </NextIntlClientProvider>,
    );
    expect(html).toBe("<span>Hell</span>");
  });
});
