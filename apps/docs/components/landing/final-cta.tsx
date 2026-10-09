import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import Button from "@/components/ui/button";
import { type Locale, localizedPath } from "@/lib/i18n";

const CLOSE_BORDER = "color-mix(in srgb, var(--v-glow) 16%, var(--border-default))";

export async function FinalCta(): Promise<ReactNode> {
  const t = await getTranslations("landing.finalClose");
  const locale = (await getLocale()) as Locale;
  return (
    <section
      data-presence="final-cta"
      className="vk-pad-top-sm vk-gutter vk-w-wide mx-auto w-full pb-3"
    >
      <div
        className="grid gap-8 rounded-xl border px-6 py-10 md:px-12 md:py-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
        style={{ background: "var(--surface-bg)", borderColor: CLOSE_BORDER }}
      >
        <h2 data-reveal="0" className="vk-h2">
          {t("heading")}
        </h2>
        <div data-reveal="1" className="flex flex-wrap gap-3">
          <Button href={localizedPath(locale, "/docs/quickstart")} variant="primary" size="lg">
            {t("start")}
          </Button>
          <Button href={localizedPath(locale, "/docs")} variant="secondary" size="lg">
            {t("docs")}
          </Button>
        </div>
      </div>
    </section>
  );
}
