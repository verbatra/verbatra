import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/shadcn/accordion";
import { i18n, isLocale, localizedPath } from "@/lib/i18n";
import { FaqAccordion } from "./faq-accordion";
import { LICENSE_URL } from "./links";
import { Section } from "./section";
import { SectionHead } from "./section-head";

export type FaqEntry = { readonly id: string; readonly question: string };

const ANSWER_LINK_CLASS =
  "underline underline-offset-4 transition-colors hover:text-[color:var(--accent)]";

const DATA_HANDLING_PATH = "/docs/data-handling";

const ITEM_CLASS =
  "border-b border-fd-border [&[data-state=closed]>[data-slot=accordion-content]]:hidden";

const TRIGGER_CLASS =
  "items-center py-5 text-(length:--text-h4) font-semibold text-fd-foreground hover:text-[color:var(--accent)] hover:no-underline data-[state=open]:text-[color:var(--accent)] [&>svg]:size-5 [&>svg]:translate-y-0 [&>svg]:text-[color:var(--accent)] motion-reduce:[&>svg]:transition-none";

function answerTags(locale: string) {
  const docsLocale = isLocale(locale) ? locale : i18n.defaultLanguage;
  return {
    license: (chunks: ReactNode) => (
      <a
        href={LICENSE_URL}
        target="_blank"
        rel="noreferrer noopener"
        className={ANSWER_LINK_CLASS}
        data-umami-event="outbound-link"
        data-umami-event-target="license"
        data-umami-event-location="faq"
      >
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
    <Section band id="faq">
      <SectionHead id="faq-heading" title={t("heading")} />
      <FaqAccordion className="mt-11 max-w-[880px] border-t border-fd-border">
        {items.map((item) => (
          <AccordionItem key={item.id} value={item.id} data-faq={item.id} className={ITEM_CLASS}>
            <AccordionTrigger
              className={TRIGGER_CLASS}
              style={{ fontFamily: "var(--font-display)" }}
            >
              {item.question}
            </AccordionTrigger>
            <AccordionContent forceMount className="pb-5">
              <p className="max-w-[68ch] text-base leading-relaxed text-fd-muted-foreground">
                {t.rich(`items.${item.id}.answer`, tags)}
              </p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </FaqAccordion>
    </Section>
  );
}
