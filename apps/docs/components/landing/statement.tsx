import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import {
  HERO_TERMINAL_NEW_KEYS,
  HERO_TERMINAL_SYNCED_KEYS,
  HERO_TRANSLATE_LOCALE_LINES,
} from "@/lib/hero-terminal";

const STATEMENT_HEADING_ID = "statement-heading";

export async function Statement(): Promise<ReactNode> {
  const t = await getTranslations("landing.statement");
  return (
    <section id="statement" aria-labelledby={STATEMENT_HEADING_ID} className="vk-statement">
      <div className="vk-gutter vk-w-wide mx-auto">
        <p className="vk-eyebrow">{t("label")}</p>
        <h2 id={STATEMENT_HEADING_ID} className="vk-statement-title">
          {t.rich("heading", {
            sent: HERO_TERMINAL_NEW_KEYS.length,
            kept: HERO_TERMINAL_SYNCED_KEYS.length,
            em: (chunks) => <em className="vk-statement-lit">{chunks}</em>,
          })}
        </h2>
        <p className="vk-statement-proof" lang="en">
          {HERO_TRANSLATE_LOCALE_LINES[0]}
        </p>
      </div>
    </section>
  );
}
