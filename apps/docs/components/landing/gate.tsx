import { getLocale, getTranslations } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
import { IntentPrefetchLink } from "@/components/ui/intent-prefetch-link";
import {
  GATE_CHECK_COMMAND,
  GATE_CHECK_EXIT_CODE,
  GATE_CHECK_HEADER,
  GATE_CHECK_LINES,
  GATE_DE_CANDIDATE,
  GATE_DE_OLD,
  GATE_KEY,
  GATE_LOCALE,
  GATE_PLACEHOLDER,
  GATE_REFUSED_BADGE,
  GATE_REFUSED_LINES,
  GATE_SOURCE,
  GATE_TRANSLATE_COMMAND,
  GATE_TRANSLATE_HEADER,
  type GateState,
} from "@/lib/gate-demo";
import { localizedPath, toLocale } from "@/lib/i18n";
import { PLAYGROUND_SOURCE_LOCALE, playgroundFileName } from "@/lib/landing-playground";
import { splitPlaceholders } from "@/lib/placeholder-segments";
import { keepCompoundsWhole, keepPackageRunsWhole } from "@/lib/word-breaks";
import { Section } from "./section";
import { SectionHead } from "./section-head";

export const GATE_HEADING_ID = "gate-heading";

const GATE_DOCS_PATH = "/docs/translation-safety";

function Placeheld({ text }: { text: string }): ReactNode {
  return splitPlaceholders(text).map((segment, index) =>
    segment.placeholder ? (
      <span key={`${index}-${segment.text}`} className="vk-ph">
        {segment.text}
      </span>
    ) : (
      segment.text
    ),
  );
}

function Moves({
  reveal,
  className,
  children,
}: {
  reveal: number;
  className: string;
  children: ReactNode;
}): ReactNode {
  return (
    <span className={`vk-gate-moves ${className}`} data-reveal={reveal}>
      {children}
    </span>
  );
}

function Frame({
  state,
  label,
  text,
  children,
}: {
  state: GateState;
  label: string;
  text: string;
  children: ReactNode;
}): ReactNode {
  return (
    <figure className="vk-gate-frame" data-state={state} aria-labelledby={`gate-${state}-caption`}>
      <figcaption id={`gate-${state}-caption`} className="vk-lock-caption">
        <b>{label}</b>
        <span>{text}</span>
      </figcaption>
      <div className="vk-lock-card vk-gate-card">{children}</div>
    </figure>
  );
}

function Cli({
  command,
  lines,
  marked,
  stamp,
}: {
  command: string;
  lines: ReadonlyArray<string>;
  marked?: number;
  stamp?: string;
}): ReactNode {
  return (
    <pre className="vk-lock-code vk-gate-code" lang="en">
      <code>
        <span className="vk-lock-line" data-kind="command">
          {keepPackageRunsWhole(`$ ${command}`)}
          {"\n"}
        </span>
        {lines.map((line, index) => (
          <span
            key={`${index}-${line}`}
            className="vk-lock-line"
            data-mark={index === marked ? "refused" : undefined}
          >
            {keepCompoundsWhole(line)}
            {index === marked && stamp !== undefined ? (
              <>
                {" "}
                <Moves reveal={0} className="vk-gate-stamp">
                  {stamp}
                </Moves>
              </>
            ) : null}
            {index < lines.length - 1 ? "\n" : ""}
          </span>
        ))}
      </code>
    </pre>
  );
}

export async function Gate(): Promise<ReactNode> {
  const t = await getTranslations("landing.gate");
  const locale = toLocale(await getLocale());
  const sourceFile = playgroundFileName(PLAYGROUND_SOURCE_LOCALE);
  const targetFile = playgroundFileName(GATE_LOCALE);
  const refusedIndex = GATE_REFUSED_LINES.findIndex((line) => line.includes(`${GATE_KEY}:`));
  const [profile = "", leaf = ""] = GATE_KEY.split(".");

  return (
    <Section id="gate" labelledBy={GATE_HEADING_ID} className="vk-gate">
      <div className="vk-gate-track">
        <div className="vk-gate-pin">
          <SectionHead id={GATE_HEADING_ID} title={t("heading")} lead={t("lead")} align="start" />
          <div className="vk-gate-stage">
            <Frame
              state="candidate"
              label={t("candidate.label")}
              text={t("candidate.text", {
                key: GATE_KEY,
                file: sourceFile,
                placeholder: GATE_PLACEHOLDER,
              })}
            >
              <p className="vk-lock-head">
                <span lang="en">{GATE_KEY}</span>{" "}
                <span className="vk-lock-badge">{t("candidate.badge")}</span>
              </p>
              <pre className="vk-lock-code vk-gate-code">
                <code>
                  <span className="vk-lock-line vk-gate-row">
                    <span className="vk-gate-lang" lang="en">
                      {PLAYGROUND_SOURCE_LOCALE}
                    </span>{" "}
                    <span lang={PLAYGROUND_SOURCE_LOCALE}>
                      {'"'}
                      <Placeheld text={GATE_SOURCE} />
                      {'"'}
                    </span>
                    {"\n"}
                  </span>
                  <span className="vk-lock-line vk-gate-row">
                    <span className="vk-gate-lang" lang="en">
                      {GATE_LOCALE}
                    </span>{" "}
                    <span lang={GATE_LOCALE}>{`"${GATE_DE_CANDIDATE}"`}</span>{" "}
                    <Moves reveal={0} className="vk-gate-slot">
                      <span className="vk-gate-slot-chip" lang="en">
                        {GATE_PLACEHOLDER}
                      </span>{" "}
                      <span className="vk-lock-tag vk-gate-missing">{t("candidate.missing")}</span>
                    </Moves>
                  </span>
                </code>
              </pre>
              <p className="vk-lock-foot">{t("candidate.foot")}</p>
            </Frame>
            <Frame state="refused" label={t("refused.label")} text={t("refused.text")}>
              <p className="vk-lock-head">
                <span lang="en">{GATE_TRANSLATE_HEADER}</span>{" "}
                <span className="vk-lock-badge vk-gate-fail" lang="en">
                  {GATE_REFUSED_BADGE}
                </span>
              </p>
              <Cli
                command={GATE_TRANSLATE_COMMAND}
                lines={GATE_REFUSED_LINES}
                marked={refusedIndex}
                stamp={t("refused.stamp")}
              />
              <p className="vk-lock-sub">
                <span lang="en">{targetFile}</span>{" "}
                <span className="vk-lock-label">{t("refused.unchanged")}</span>
              </p>
              <pre className="vk-lock-code vk-gate-code" lang="en">
                <code>
                  <span className="vk-lock-line" style={{ "--d": 0 } as CSSProperties}>
                    {`"${profile}": {\n`}
                  </span>
                  <span className="vk-lock-line" style={{ "--d": 1 } as CSSProperties}>
                    <span className="vk-lock-key">{JSON.stringify(leaf)}</span>
                    {": "}
                    <span className="vk-lock-value" lang={GATE_LOCALE}>
                      {'"'}
                      <Placeheld text={GATE_DE_OLD} />
                      {'"'}
                    </span>
                    {"\n"}
                  </span>
                  <span className="vk-lock-line" style={{ "--d": 0 } as CSSProperties}>
                    {"}"}
                  </span>
                </code>
              </pre>
            </Frame>
            <Frame state="stale" label={t("stale.label")} text={t("stale.text")}>
              <p className="vk-lock-head">
                <span lang="en">{GATE_CHECK_HEADER}</span>{" "}
                <Moves reveal={0} className="vk-lock-badge vk-gate-fail vk-gate-exit">
                  <span lang="en">{`exit ${GATE_CHECK_EXIT_CODE}`}</span>
                </Moves>
              </p>
              <Cli command={GATE_CHECK_COMMAND} lines={GATE_CHECK_LINES} />
              <p className="vk-lock-foot">
                {t("stale.foot", { file: targetFile, placeholder: GATE_PLACEHOLDER })}
              </p>
            </Frame>
          </div>
        </div>
      </div>
      <p className="vk-gate-docs">
        <IntentPrefetchLink
          href={localizedPath(locale, GATE_DOCS_PATH)}
          className="vk-deck-link"
          lang="en"
        >
          {GATE_DOCS_PATH.slice(1)}
        </IntentPrefetchLink>
      </p>
    </Section>
  );
}
