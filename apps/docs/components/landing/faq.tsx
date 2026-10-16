import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { i18n, isLocale, localizedPath } from "@/lib/i18n";
import { FaqAccordion } from "./islands";
import { LICENSE_URL } from "./links";
import { Section } from "./section";
import { SectionHead } from "./section-head";

export type FaqEntry = { readonly id: string; readonly question: string };

const ANSWER_LINK_CLASS = "underline underline-offset-4 transition-colors hover:text-(--accent)";

const DATA_HANDLING_PATH = "/docs/data-handling";

function answerTags(locale: string) {
  const docsLocale = isLocale(locale) ? locale : i18n.defaultLanguage;
  return {
    license: (chunks: ReactNode) => (
      <a href={LICENSE_URL} target="_blank" rel="noreferrer noopener" className={ANSWER_LINK_CLASS}>
        {chunks}
      </a>
    ),
    dataHandling: (chunks: ReactNode) => (
      <a href={localizedPath(docsLocale, DATA_HANDLING_PATH)} className={ANSWER_LINK_CLASS}>
        {chunks}
      </a>
    ),
  };
}

export async function Faq({ items }: { items: ReadonlyArray<FaqEntry> }): Promise<ReactNode> {
  const t = await getTranslations("landing.faq");
  const tags = answerTags(await getLocale());

  return (
    <Section band id="faq" labelledBy="faq-heading">
      <SectionHead id="faq-heading" title={t("heading")} />
      <FaqAccordion
        className="mt-(--head-gap) max-w-[880px] border-t border-(--border-default)"
        items={items.map((item) => ({
          id: item.id,
          question: item.question,
          content: t.rich(`items.${item.id}.answer`, tags),
        }))}
      />
    </Section>
  );
}
