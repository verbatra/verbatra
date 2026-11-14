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
  GATE_DOCS_PATH,
  GATE_KEY,
  GATE_LOCALE,
  GATE_MODEL,
  GATE_PLACEHOLDER,
  GATE_REFUSED_BADGE,
  GATE_REFUSED_LINES,
  GATE_SOURCE,
  GATE_SOURCE_BEFORE,
  GATE_SOURCE_FILE,
  GATE_SOURCE_LOCALE,
  GATE_STATES,
  GATE_TARGET_FILE,
  GATE_TRANSLATE_COMMAND,
  GATE_TRANSLATE_HEADER,
  type GateState,
} from "@/lib/gate-demo";
import { localizedPath, toLocale } from "@/lib/i18n";
import { splitPlaceholders } from "@/lib/placeholder-segments";
import { keepCompoundsWhole, keepPackageRunsWhole } from "@/lib/word-breaks";
import { Section } from "./section";
import { SectionHead } from "./section-head";

export const GATE_HEADING_ID = "gate-heading";

function PlaceholderText({ text }: { text: string }): ReactNode {
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

function Entrance({ className, children }: { className: string; children: ReactNode }): ReactNode {
  return (
    <span className={`vk-gate-moves ${className}`} data-reveal={0}>
      {children}
    </span>
  );
}

function Position({ state }: { state: GateState }): ReactNode {
  return (
    <span className="vk-gate-marker" aria-hidden="true">
      {GATE_STATES.map((segment) => (
        <i key={segment} data-on={segment === state ? "" : undefined} />
      ))}
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
    <figure className="vk-gate-frame" data-state={state}>
      <figcaption className="vk-lock-caption">
        <b>
          {label}
          <Position state={state} />
        </b>
        <span>{text}</span>
      </figcaption>
      <div className="vk-lock-card vk-gate-card">{children}</div>
    </figure>
  );
}

function lineOrder(index: number, count: number, marked: number | undefined): number {
  if (marked === undefined || marked < 0 || index < marked) return index + 1;
  return index === marked ? count : index;
}

function Cli({
  command,
  lines,
  marked,
}: {
  command: string;
  lines: ReadonlyArray<string>;
  marked?: number;
}): ReactNode {
  return (
    <pre className="vk-lock-code vk-gate-code vk-gate-cli" lang="en">
      <code>
        <span className="vk-lock-line" data-kind="command" style={{ "--n": 0 } as CSSProperties}>
          {keepPackageRunsWhole(`$ ${command}`)}
          {"\n"}
        </span>
        {lines.map((line, index) => (
          <span
            key={`${index}-${line}`}
            className="vk-lock-line"
            data-mark={index === marked ? "refused" : undefined}
            style={{ "--n": lineOrder(index, lines.length, marked) } as CSSProperties}
          >
            {keepCompoundsWhole(line)}
            {index < lines.length - 1 ? "\n" : ""}
          </span>
        ))}
      </code>
    </pre>
  );
}

function ValueRow({
  sign,
  locale,
  value,
  diff,
  fold,
  children,
}: {
  sign?: string;
  locale: string;
  value: string;
  diff?: "added" | "removed";
  fold?: "drop";
  children?: ReactNode;
}): ReactNode {
  return (
    <span className="vk-lock-line vk-gate-row" data-diff={diff} data-fold={fold}>
      {sign === undefined ? null : (
        <span className="vk-lock-sign" aria-hidden="true">
          {sign}
        </span>
      )}
      <span lang={locale}>
        {'"'}
        <PlaceholderText text={value} />
        {'"'}
      </span>
      {children}
    </span>
  );
}

function TargetFile({ label, fold }: { label: string; fold?: "drop" }): ReactNode {
  const [group = "", leaf = ""] = GATE_KEY.split(".");
  return (
    <>
      <p className="vk-lock-sub" data-fold={fold}>
        <span lang="en">{GATE_TARGET_FILE}</span> <span className="vk-lock-label">{label}</span>
      </p>
      <pre className="vk-lock-code vk-gate-code" lang="en" data-fold={fold}>
        <code>
          <span className="vk-lock-line" style={{ "--d": 0 } as CSSProperties}>
            {`"${group}": {\n`}
          </span>
          <span className="vk-lock-line" style={{ "--d": 1 } as CSSProperties}>
            <span className="vk-lock-key">{JSON.stringify(leaf)}</span>
            {": "}
            <span className="vk-lock-value" lang={GATE_LOCALE}>
              {'"'}
              <PlaceholderText text={GATE_DE_OLD} />
              {'"'}
            </span>
            {"\n"}
          </span>
          <span className="vk-lock-line" style={{ "--d": 0 } as CSSProperties}>
            {"}"}
          </span>
        </code>
      </pre>
    </>
  );
}

export async function Gate(): Promise<ReactNode> {
  const t = await getTranslations("landing.gate");
  const locale = toLocale(await getLocale());
  const refusedIndex = GATE_REFUSED_LINES.findIndex((line) => line.includes(`${GATE_KEY}:`));
  const lead = (
    <>
      {t("lead")}{" "}
      <IntentPrefetchLink
        href={localizedPath(locale, GATE_DOCS_PATH)}
        className="vk-deck-link vk-gate-docs"
        lang="en"
      >
        {GATE_DOCS_PATH.slice(1)}
      </IntentPrefetchLink>
    </>
  );

  return (
    <Section id="gate" labelledBy={GATE_HEADING_ID} className="vk-gate">
      <div className="vk-gate-track">
        <div className="vk-gate-pin">
          <SectionHead id={GATE_HEADING_ID} title={t("heading")} lead={lead} align="start" />
          <div className="vk-gate-stage">
            <Frame
              state="candidate"
              label={t("candidate.label")}
              text={t("candidate.text", {
                key: GATE_KEY,
                file: GATE_SOURCE_FILE,
                placeholder: GATE_PLACEHOLDER,
              })}
            >
              <p className="vk-lock-head">
                <span lang="en">{GATE_KEY}</span>{" "}
                <span className="vk-lock-badge" lang="en">
                  {GATE_MODEL}
                </span>
              </p>
              <p className="vk-lock-sub">
                <span lang="en">{GATE_SOURCE_FILE}</span>{" "}
                <span className="vk-lock-label">{t("candidate.edited")}</span>
              </p>
              <pre className="vk-lock-code vk-gate-code">
                <code>
                  <ValueRow
                    sign="-"
                    diff="removed"
                    fold="drop"
                    locale={GATE_SOURCE_LOCALE}
                    value={GATE_SOURCE_BEFORE}
                  >
                    {"\n"}
                  </ValueRow>
                  <ValueRow sign="+" diff="added" locale={GATE_SOURCE_LOCALE} value={GATE_SOURCE} />
                </code>
              </pre>
              <p className="vk-lock-sub">
                <span lang="en">{GATE_LOCALE}</span>{" "}
                <span className="vk-lock-label">{t("candidate.answer")}</span>
              </p>
              <pre className="vk-lock-code vk-gate-code">
                <code>
                  <ValueRow locale={GATE_LOCALE} value={GATE_DE_CANDIDATE}>
                    {" "}
                    <Entrance className="vk-gate-slot">
                      <span className="vk-gate-slot-chip" lang="en">
                        {GATE_PLACEHOLDER}
                      </span>{" "}
                      <span className="vk-lock-tag vk-gate-missing">{t("candidate.missing")}</span>
                    </Entrance>
                  </ValueRow>
                </code>
              </pre>
              <p className="vk-lock-foot" data-fold="drop">
                {t("candidate.foot")}
              </p>
            </Frame>
            <Frame state="refused" label={t("refused.label")} text={t("refused.text")}>
              <p className="vk-lock-head">
                <span lang="en">{GATE_TRANSLATE_HEADER}</span>{" "}
                <span className="vk-gate-head-end">
                  <Entrance className="vk-gate-stamp">{t("refused.stamp")}</Entrance>{" "}
                  <span className="vk-lock-badge vk-gate-fail" lang="en">
                    {GATE_REFUSED_BADGE}
                  </span>
                </span>
              </p>
              <Cli
                command={GATE_TRANSLATE_COMMAND}
                lines={GATE_REFUSED_LINES}
                marked={refusedIndex}
              />
              <TargetFile label={t("refused.unchanged")} />
            </Frame>
            <Frame state="stale" label={t("stale.label")} text={t("stale.text")}>
              <p className="vk-lock-head">
                <span lang="en">{GATE_CHECK_HEADER}</span>{" "}
                <Entrance className="vk-lock-badge vk-gate-fail vk-gate-exit">
                  <span lang="en">{`exit ${GATE_CHECK_EXIT_CODE}`}</span>
                </Entrance>
              </p>
              <Cli command={GATE_CHECK_COMMAND} lines={GATE_CHECK_LINES} />
              <TargetFile label={t("refused.unchanged")} fold="drop" />
              <p className="vk-lock-foot">
                {t("stale.foot", { file: GATE_TARGET_FILE, placeholder: GATE_PLACEHOLDER })}
              </p>
            </Frame>
          </div>
        </div>
      </div>
    </Section>
  );
}
