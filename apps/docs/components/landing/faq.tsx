"use client";

import { motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import Button from "@/components/ui/button";
import { type Locale, localizedPath } from "@/lib/i18n";
import { useReducedMotionPreference } from "@/lib/reduced-motion";
import type { FaqItem } from "@/lib/structured-data";
import { GITHUB_ISSUES_URL, RELEASES_URL } from "./links";
import { SectionHead } from "./section-head";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export type FaqEntry = FaqItem & { id: string };

const answerTags = {
  releases: (chunks: ReactNode) => (
    <a
      href={RELEASES_URL}
      target="_blank"
      rel="noreferrer noopener"
      className="underline underline-offset-4 transition-colors hover:text-[color:var(--accent)]"
    >
      {chunks}
    </a>
  ),
};

function FaqRow({
  item,
  index,
  isOpen,
  onToggle,
  reduced,
}: {
  item: FaqEntry;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  reduced: boolean;
}): ReactNode {
  const t = useTranslations("landing.faq");
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
          className={`flex w-full items-center justify-between gap-4 py-5 text-left text-base font-medium transition-colors hover:text-[color:var(--accent)] ${
            isOpen ? "text-[color:var(--accent)]" : "text-fd-foreground"
          }`}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {item.question}
          <motion.span
            aria-hidden="true"
            className="relative grid h-4 w-4 shrink-0 place-items-center"
            initial={false}
            animate={{ rotate: isOpen ? 45 : 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT }}
          >
            <span className="h-px w-3.5" style={{ background: "var(--v-glow)" }} />
            <span className="absolute h-3.5 w-px" style={{ background: "var(--v-glow)" }} />
          </motion.span>
        </button>
      </h3>
      <motion.section
        id={panelId}
        aria-labelledby={buttonId}
        className="overflow-hidden"
        initial={false}
        animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE_OUT }}
      >
        <p className="max-w-[60ch] pb-5 text-sm leading-relaxed text-fd-muted-foreground">
          {t.rich(`items.${item.id}.answer`, answerTags)}
        </p>
      </motion.section>
    </div>
  );
}

export function Faq({ items }: { items: ReadonlyArray<FaqEntry> }): ReactNode {
  const t = useTranslations("landing.faq");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(0);
  const reduced = useReducedMotionPreference();

  return (
    <section className="vk-gutter vk-w-wide vk-rhythm-md mx-auto">
      <div className="grid gap-10 md:grid-cols-5 md:gap-12">
        <div className="md:col-span-2 md:sticky md:top-24 md:self-start">
          <SectionHead title={t("heading")} lead={t("supporting")} />
          <div className="mt-7 flex flex-col items-start gap-4">
            <Button
              href={localizedPath(locale, "/docs/your-first-translation")}
              variant="secondary"
              size="md"
            >
              {t("ctaDocs")}
            </Button>
            <a
              href={GITHUB_ISSUES_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-6 items-center gap-1.5 text-sm text-fd-muted-foreground underline-offset-4 transition-colors hover:text-[color:var(--accent)] hover:underline"
            >
              {t("ctaIssue")}
              <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>

        <div className="border-t border-fd-border md:col-span-3">
          {items.map((item, i) => (
            <FaqRow
              key={item.id}
              item={item}
              index={i}
              isOpen={open === i}
              onToggle={() => setOpen((current) => (current === i ? -1 : i))}
              reduced={reduced}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
