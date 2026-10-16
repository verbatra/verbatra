import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import {
  FAQ_ANSWER_LINKS,
  FAQ_ASIDE_LINKS,
  FAQ_ITEM_IDS,
  type FaqItemId,
  faqHref,
  faqValues,
} from "@/lib/landing-faq";
import type { FaqItem } from "@/lib/structured-data";
import { FaqKeys } from "./faq-keys";
import { LICENSE_URL } from "./links";
import { Section } from "./section";
import { SectionAside } from "./section-head";

type FaqTranslator = Awaited<ReturnType<typeof getTranslations<"landing.faq">>>;

export type FaqContent = FaqItem & { readonly id: FaqItemId; readonly content: ReactNode };

const FAQ_LIST_ID = "faq-list";

function answerTags(locale: Locale, id: FaqItemId) {
  return {
    link: (chunks: ReactNode) => (
      <a href={faqHref(locale, FAQ_ANSWER_LINKS[id])} className="vk-prose-link">
        {chunks}
      </a>
    ),
    license: (chunks: ReactNode) => (
      <a href={LICENSE_URL} target="_blank" rel="noreferrer noopener" className="vk-prose-link">
        {chunks}
      </a>
    ),
  };
}

const PLAIN_TAGS = { link: (chunks: string) => chunks, license: (chunks: string) => chunks };

export async function faqContent(locale: Locale): Promise<ReadonlyArray<FaqContent>> {
  const t: FaqTranslator = await getTranslations({ locale, namespace: "landing.faq" });
  return FAQ_ITEM_IDS.map((id) => {
    const values = faqValues(id, locale);
    return {
      id,
      question: t(`items.${id}.question`),
      answer: t.markup(`items.${id}.answer`, { ...values, ...PLAIN_TAGS }),
      content: t.rich(`items.${id}.answer`, { ...values, ...answerTags(locale, id) }),
    };
  });
}

function DocsLinks({ t, locale }: { t: FaqTranslator; locale: Locale }): ReactNode {
  return (
    <nav aria-labelledby="faq-docs-label" className="vk-faq-docs">
      <p id="faq-docs-label" className="vk-faq-docs-label">
        {t("docs.label")}
      </p>
      <ul>
        {FAQ_ASIDE_LINKS.map(({ key, link }) => (
          <li key={key}>
            <a href={faqHref(locale, link)} className="vk-prose-link" data-faq-doc={key}>
              {t(`docs.${key}`)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export async function Faq({ locale }: { locale: Locale }): Promise<ReactNode> {
  const t: FaqTranslator = await getTranslations({ locale, namespace: "landing.faq" });
  const items = await faqContent(locale);

  return (
    <Section id="faq" labelledBy="faq-heading">
      <SectionAside
        id="faq-heading"
        title={t("heading")}
        lead={t("lead")}
        aside={<DocsLinks t={t} locale={locale} />}
      >
        <div id={FAQ_LIST_ID} className="vk-faq">
          {items.map((item) => (
            <details key={item.id} data-faq={item.id} className="vk-faq-item">
              <summary className="vk-faq-summary">
                <h3 className="vk-faq-question">{item.question}</h3>
                <span aria-hidden="true" className="vk-faq-mark" />
              </summary>
              <p className="vk-faq-answer">{item.content}</p>
            </details>
          ))}
        </div>
        <FaqKeys listId={FAQ_LIST_ID} />
      </SectionAside>
    </Section>
  );
}
