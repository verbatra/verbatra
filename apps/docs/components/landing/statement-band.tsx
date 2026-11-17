import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { splitWords } from "@/lib/word-segments";
import { Section } from "./section";

const STATEMENT_TEXT_ID = "statement-text";

export async function StatementBand(): Promise<ReactNode> {
  const t = await getTranslations("landing.statement");
  return (
    <Section id="statement" labelledBy={STATEMENT_TEXT_ID} className="vk-statement">
      <p id={STATEMENT_TEXT_ID} className="vk-statement-text vk-words">
        {splitWords(t("text"))}
      </p>
    </Section>
  );
}
