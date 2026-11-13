import { getTranslations } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
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
import { cn } from "@/lib/utils";
import { keepPackageRunsWhole } from "@/lib/word-breaks";
import { PlainList } from "./plain-list";
import { Section } from "./section";
import { SectionHead } from "./section-head";

const HIGHLIGHTS_HEADING_ID = "highlights-heading";

const TRANSLATE_TITLE_ID = "highlights-translate-title";

const TRANSLATE_LINES: ReadonlyArray<string> = [
  `$ ${HERO_TRANSLATE_COMMAND}`,
  ...HERO_TRANSLATE_OUTPUT.slice(1),
];

const MIN_HANG = 2;

function hangOf(line: string): number {
  return Math.max(MIN_HANG, line.length - line.trimStart().length);
}

function lineTone(line: string, index: number): string | undefined {
  if (index === 0) return "vk-tile-code-strong";
  return line.trim() === HERO_TRANSLATE_TOTAL_LINE ? "vk-tile-code-total" : undefined;
}

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
  return (
    <Section id="highlights" labelledBy={HIGHLIGHTS_HEADING_ID}>
      <SectionHead id={HIGHLIGHTS_HEADING_ID} title={t("heading")} lead={t("lead")} align="start" />
      <div className="vk-bento">
        <article className="vk-tile" data-span="4">
          <TileLabel>{t("translate.label")}</TileLabel>
          <h3 id={TRANSLATE_TITLE_ID} className="vk-tile-title">
            {t("translate.title")}
          </h3>
          <p className="vk-tile-body">
            {t("translate.body", { sent: HERO_SENT_STRINGS, total: HERO_TOTAL_STRINGS })}
          </p>
          {/* biome-ignore lint/a11y/useSemanticElements: a fieldset groups form controls; this names a wrapped code block without adding a landmark */}
          <div
            role="group"
            aria-labelledby={TRANSLATE_TITLE_ID}
            className="vk-tile-code vk-tile-code-wrap"
            lang="en"
          >
            <pre className="vk-tile-pre">
              <code>
                {TRANSLATE_LINES.map((line, index) => (
                  <span
                    key={line}
                    className={cn("vk-tile-line", lineTone(line, index))}
                    style={{ "--vk-hang": `${hangOf(line)}ch` } as CSSProperties}
                  >
                    {index < TRANSLATE_LINES.length - 1 ? `${line}\n` : line}
                  </span>
                ))}
              </code>
            </pre>
          </div>
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
