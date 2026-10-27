import { getTranslations } from "next-intl/server";
import { Fragment, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import { SHORT_CODE_CLASS } from "@/lib/inline-code";
import {
  FAQ_ANSWER_LINKS,
  FAQ_ASIDE_LINKS,
  FAQ_ITEM_IDS,
  type FaqItemId,
  faqHref,
  faqValues,
} from "@/lib/landing-faq";
import type { FaqItem } from "@/lib/structured-data";
import { cn } from "@/lib/utils";
import { keepCompoundsWhole } from "@/lib/word-breaks";
import { FaqKeys } from "./islands";
import { LICENSE_URL } from "./links";
import { Section } from "./section";
import { SectionAside } from "./section-head";

type FaqTranslator = Awaited<ReturnType<typeof getTranslations<"landing.faq">>>;

type FaqContent = FaqItem & { readonly id: FaqItemId; readonly content: ReactNode };

const FAQ_LIST_ID = "faq-list";

function answerTags(locale: Locale, id: FaqItemId, newTab: string) {
  return {
    link: (chunks: ReactNode) => (
      <a href={faqHref(locale, FAQ_ANSWER_LINKS[id])} className="vk-prose-link">
        {chunks}
      </a>
    ),
    license: (chunks: ReactNode) => (
      <a href={LICENSE_URL} target="_blank" rel="noreferrer noopener" className="vk-prose-link">
        {chunks}
        <span className="sr-only"> {newTab}</span>
      </a>
    ),
    code: (chunks: ReactNode) => (
      <code
        lang="en"
        className={cn(SHORT_CODE_CLASS, "font-mono text-[0.9em] text-(--text-strong)")}
      >
        {chunks}
      </code>
    ),
  };
}

const PLAIN_TAGS = {
  link: (chunks: string) => chunks,
  license: (chunks: string) => chunks,
  code: (chunks: string) => chunks,
};

function keepCompounds(node: ReactNode): ReactNode {
  if (typeof node === "string") return keepCompoundsWhole(node);
  if (!Array.isArray(node)) return node;
  return node.map((part, index) => (
    <Fragment key={`part-${index}`}>{keepCompounds(part)}</Fragment>
  ));
}

export async function faqContent(locale: Locale): Promise<ReadonlyArray<FaqContent>> {
  const t: FaqTranslator = await getTranslations({ locale, namespace: "landing.faq" });
  const newTab = (await getTranslations({ locale, namespace: "landing.openSource" }))("newTab");
  return FAQ_ITEM_IDS.map((id) => {
    const values = faqValues(id, locale);
    return {
      id,
      question: t(`items.${id}.question`),
      answer: t.markup(`items.${id}.answer`, { ...values, ...PLAIN_TAGS }),
      content: keepCompounds(
        t.rich(`items.${id}.answer`, { ...values, ...answerTags(locale, id, newTab) }),
      ),
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

export async function Faq({
  locale,
  items,
}: {
  locale: Locale;
  items: ReadonlyArray<FaqContent>;
}): Promise<ReactNode> {
  const t: FaqTranslator = await getTranslations({ locale, namespace: "landing.faq" });

  return (
    <Section id="faq" labelledBy="faq-heading">
      <SectionAside
        id="faq-heading"
        title={t("heading")}
        lead={t("lead")}
        className="vk-faq-aside"
        trailing={<DocsLinks t={t} locale={locale} />}
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
