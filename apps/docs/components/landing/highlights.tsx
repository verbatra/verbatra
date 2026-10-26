import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import {
  HERO_CHECK_EXIT_CODE,
  HERO_SENT_STRINGS,
  HERO_TOTAL_STRINGS,
  HERO_TRANSLATE_COMMAND,
  HERO_TRANSLATE_OUTPUT,
  HERO_TRANSLATE_TOTAL_LINE,
} from "@/lib/hero-terminal";
import { MCP_ADD_COMMAND } from "@/lib/install-commands";
import {
  PLAYGROUND_DEFAULT_ITEM,
  PLAYGROUND_LANGUAGES,
  PLAYGROUND_TRANSLATIONS,
} from "@/lib/landing-playground";
import { keepPackageRunsWhole } from "@/lib/word-breaks";
import { PlainList } from "./plain-list";
import { ScrollBlock } from "./scroll-block";
import { Section } from "./section";
import { SectionHead } from "./section-head";

const HIGHLIGHTS_HEADING_ID = "highlights-heading";

const TRANSLATE_TITLE_ID = "highlights-translate-title";

const PLACEHOLDER = /(\{[^{}]+\})/;

function withPlaceholders(text: string): ReactNode {
  return text.split(PLACEHOLDER).map((part, index) =>
    PLACEHOLDER.test(part) ? (
      <mark key={`${index}-${part}`} className="vk-highlight-placeholder">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function TileLabel({ children }: { children: ReactNode }): ReactNode {
  return <p className="vk-tile-label">{children}</p>;
}

export async function Highlights(): Promise<ReactNode> {
  const t = await getTranslations("landing.highlights");
  const runLines = HERO_TRANSLATE_OUTPUT.slice(1);
  return (
    <Section id="highlights" labelledBy={HIGHLIGHTS_HEADING_ID}>
      <SectionHead id={HIGHLIGHTS_HEADING_ID} title={t("heading")} lead={t("lead")} align="start" />
      <div className="vk-bento">
        <article className="vk-tile" data-span="4">
          <TileLabel>{t("translate.label")}</TileLabel>
          <h3 id={TRANSLATE_TITLE_ID} className="vk-tile-title">
            {t("translate.title", { sent: HERO_SENT_STRINGS, total: HERO_TOTAL_STRINGS })}
          </h3>
          <ScrollBlock labelledBy={TRANSLATE_TITLE_ID} className="vk-tile-code" lang="en">
            <pre className="vk-tile-pre">
              <code>
                <span className="vk-tile-code-strong">$ {HERO_TRANSLATE_COMMAND}</span>
                {runLines.map((line) =>
                  line.trim() === HERO_TRANSLATE_TOTAL_LINE ? (
                    <span key={line} className="vk-tile-code-total">
                      {`\n${line}`}
                    </span>
                  ) : (
                    `\n${line}`
                  ),
                )}
              </code>
            </pre>
          </ScrollBlock>
        </article>
        <article className="vk-tile vk-tile-glow" data-span="2">
          <TileLabel>{t("ci.label")}</TileLabel>
          <h3 className="vk-tile-title">{t("ci.title")}</h3>
          <p className="vk-tile-exit" lang="en">
            exit {HERO_CHECK_EXIT_CODE}
          </p>
          <p className="vk-tile-body">{t("ci.body", { code: HERO_CHECK_EXIT_CODE })}</p>
        </article>
        <article className="vk-tile" data-span="3">
          <TileLabel>{t("integrity.label")}</TileLabel>
          <h3 className="vk-tile-title">{t("integrity.title")}</h3>
          <PlainList className="vk-tile-langs">
            {PLAYGROUND_LANGUAGES.map((code) => (
              <li key={code} lang={code} className="vk-tile-lang-row">
                <span className="vk-tile-lang">{code}:</span>{" "}
                <span>
                  {withPlaceholders(PLAYGROUND_TRANSLATIONS[code]?.[PLAYGROUND_DEFAULT_ITEM] ?? "")}
                </span>
              </li>
            ))}
          </PlainList>
        </article>
        <article className="vk-tile" data-span="3">
          <TileLabel>{t("agents.label")}</TileLabel>
          <h3 className="vk-tile-title">{t("agents.title")}</h3>
          <p className="vk-tile-body">{t("agents.body")}</p>
          <div className="vk-tile-code vk-tile-code-end vk-tile-code-wrap" lang="en">
            <pre className="vk-tile-pre">
              <code>{keepPackageRunsWhole(MCP_ADD_COMMAND)}</code>
            </pre>
          </div>
        </article>
      </div>
    </Section>
  );
}
