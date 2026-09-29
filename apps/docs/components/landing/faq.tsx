"use client";

import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { i18n, isLocale, localizedPath } from "@/lib/i18n";
import type { FaqItem } from "@/lib/structured-data";
import { cn } from "@/lib/utils";
import { RELEASES_URL } from "./links";
import { SectionHead } from "./section-head";

export type FaqEntry = FaqItem & { id: string };

const ANSWER_LINK_CLASS =
  "underline underline-offset-4 transition-colors hover:text-[color:var(--accent)]";

const LANGUAGE_SUPPORT_PATH = "/docs/language-support";
const DATA_HANDLING_PATH = "/docs/data-handling";

function answerTags(locale: string) {
  const docsLocale = isLocale(locale) ? locale : i18n.defaultLanguage;
  const docsLink = (path: string) => (chunks: ReactNode) => (
    <a href={localizedPath(docsLocale, path)} className={ANSWER_LINK_CLASS}>
      {chunks}
    </a>
  );
  return {
    releases: (chunks: ReactNode) => (
      <a
        href={RELEASES_URL}
        target="_blank"
        rel="noreferrer noopener"
        className={ANSWER_LINK_CLASS}
      >
        {chunks}
      </a>
    ),
    languages: docsLink(LANGUAGE_SUPPORT_PATH),
    dataHandling: docsLink(DATA_HANDLING_PATH),
  };
}

function FaqRow({
  item,
  index,
  isOpen,
  onToggle,
}: {
  item: FaqEntry;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}): ReactNode {
  const t = useTranslations("landing.faq");
  const locale = useLocale();
  const panelId = `faq-panel-${index}`;
  const buttonId = `faq-button-${index}`;
  return (
    <div className="border-b border-fd-border">
      <h3>
        <button
          type="button"
          id={buttonId}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={onToggle}
          className={`flex w-full items-center justify-between gap-4 py-5 text-left text-(length:--text-h4) font-semibold transition-colors hover:text-[color:var(--accent)] ${
            isOpen ? "text-[color:var(--accent)]" : "text-fd-foreground"
          }`}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {item.question}
          <span
            aria-hidden="true"
            className={cn(
              "relative grid h-4 w-4 shrink-0 place-items-center transition-transform duration-200 ease-(--ease-out) motion-reduce:transition-none",
              isOpen && "rotate-45",
            )}
          >
            <span className="h-px w-3.5" style={{ background: "var(--v-glow)" }} />
            <span className="absolute h-3.5 w-px" style={{ background: "var(--v-glow)" }} />
          </span>
        </button>
      </h3>
      <section
        id={panelId}
        aria-labelledby={buttonId}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-(--ease-out) motion-reduce:transition-none",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <p className="max-w-[68ch] pb-5 text-base leading-relaxed text-fd-muted-foreground">
            {t.rich(`items.${item.id}.answer`, answerTags(locale))}
          </p>
        </div>
      </section>
    </div>
  );
}

export function Faq({ items }: { items: ReadonlyArray<FaqEntry> }): ReactNode {
  const t = useTranslations("landing.faq");
  const [open, setOpen] = useState(-1);

  return (
    <section className="vk-gutter vk-w-wide vk-rhythm-lg mx-auto" id="faq">
      <div>
        <SectionHead title={t("heading")} />
      </div>
      <div className="mt-11 max-w-[880px] border-t border-fd-border">
        {items.map((item, i) => (
          <FaqRow
            key={item.id}
            item={item}
            index={i}
            isOpen={open === i}
            onToggle={() => setOpen((current) => (current === i ? -1 : i))}
          />
        ))}
      </div>
    </section>
  );
}
