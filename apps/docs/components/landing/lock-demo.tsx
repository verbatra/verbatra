import { getLocale, getTranslations } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
import {
  HERO_CHECK_BADGE,
  HERO_TRANSLATE_BADGE,
  HERO_TRANSLATE_COMMAND,
  HERO_TRANSLATE_LOCALE_LINES,
  HERO_TRANSLATE_OUTPUT,
} from "@/lib/hero-terminal";
import { toLocale } from "@/lib/i18n";
import {
  PLAYGROUND_METADATA,
  PLAYGROUND_SOURCE_LOCALE,
  playgroundFileName,
  playgroundGeneratedOn,
} from "@/lib/landing-playground";
import {
  type CodeLine,
  LOCK_DEMO_COUNTS,
  LOCK_DEMO_LOCALE,
  LOCK_FILE_NAME,
  lockDemoSourceLines,
  lockDemoTranslationLines,
  lockLines,
} from "@/lib/lock-demo";
import { splitPlaceholders } from "@/lib/placeholder-segments";
import { LockDemoMotion } from "./islands";
import type { LockDemoStep } from "./lock-demo-motion";
import { Section } from "./section";
import { SectionHead } from "./section-head";

export const LOCK_DEMO_HEADING_ID = "lock-demo-heading";

type Translate = Awaited<ReturnType<typeof getTranslations<"landing.lockDemo">>>;

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

function GapLine({
  line,
  t,
  style,
  end,
}: {
  line: Extract<CodeLine, { kind: "gap" }>;
  t: Translate;
  style: CSSProperties;
  end: string;
}) {
  const folded = line.fold !== undefined && line.fold > 0;
  return (
    <span
      className="vk-lock-line"
      style={style}
      data-kind="gap"
      data-empty={line.count === 0 ? "" : undefined}
      data-fold={line.fold === 0 ? "drop" : undefined}
      data-short={folded ? t("gap", { count: line.fold ?? 0 }) : undefined}
    >
      <span className="vk-lock-gap-full">{`${t("gap", { count: line.count })}${end}`}</span>
    </span>
  );
}

function Line({
  line,
  t,
  valueLang,
  end,
}: {
  line: CodeLine;
  t: Translate;
  valueLang?: string;
  end: string;
}) {
  const style = { "--d": line.depth } as CSSProperties;
  if (line.kind === "gap") return <GapLine line={line} t={t} style={style} end={end} />;
  if (line.kind === "text") {
    return (
      <span className="vk-lock-line" style={style}>
        {`${line.text}${end}`}
      </span>
    );
  }
  if (line.kind === "open") {
    return (
      <span className="vk-lock-line" style={style}>
        <span className="vk-lock-key">{JSON.stringify(line.key)}</span>
        {`: {${end}`}
      </span>
    );
  }
  if (line.kind === "close") {
    return (
      <span className="vk-lock-line" style={style}>
        {`${line.comma ? "}," : "}"}${end}`}
      </span>
    );
  }
  return (
    <span
      className="vk-lock-line"
      style={style}
      data-mark={line.mark}
      data-fold={line.neighbour === true ? "drop" : undefined}
    >
      {line.mark === undefined ? null : (
        <span className="vk-lock-sign" aria-hidden="true">
          ~
        </span>
      )}
      <span className="vk-lock-key">{JSON.stringify(line.key)}</span>
      {": "}
      <span className="vk-lock-value" lang={valueLang}>
        {'"'}
        <Placeheld text={line.value} />
        {'"'}
      </span>
      {line.comma ? "," : ""}
      {line.mark === undefined ? null : (
        <>
          {" "}
          <span className="vk-lock-tag">{t(`tags.${line.mark}`)}</span>
        </>
      )}
      {end}
    </span>
  );
}

function Code({
  lines,
  t,
  valueLang,
}: {
  lines: ReadonlyArray<CodeLine>;
  t: Translate;
  valueLang?: string;
}): ReactNode {
  return (
    <pre className="vk-lock-code">
      <code>
        {lines.map((line, index) => (
          <Line
            key={`${index}-${line.kind}`}
            line={line}
            t={t}
            valueLang={valueLang}
            end={index < lines.length - 1 ? "\n" : ""}
          />
        ))}
      </code>
    </pre>
  );
}

function Frame({
  step,
  file,
  badge,
  badgeLang,
  headFold,
  children,
  foot,
}: {
  step: LockDemoStep;
  file: string;
  badge: string;
  badgeLang?: string;
  headFold?: boolean;
  children: ReactNode;
  foot: ReactNode;
}): ReactNode {
  return (
    <figure id={step.id} className="vk-lock-frame" aria-labelledby={`${step.id}-caption`}>
      <figcaption id={`${step.id}-caption`} className="vk-lock-caption">
        <b>{step.label}</b>
        <span>{step.text}</span>
      </figcaption>
      <div className="vk-lock-card" data-reveal={0}>
        <p className="vk-lock-head" data-fold={headFold === true ? "drop" : undefined}>
          <span>{file}</span>{" "}
          <span className="vk-lock-badge" lang={badgeLang}>
            {badge}
          </span>
        </p>
        {children}
        {foot}
      </div>
    </figure>
  );
}

export async function LockDemo(): Promise<ReactNode> {
  const t = await getTranslations("landing.lockDemo");
  const locale = toLocale(await getLocale());
  const generated = playgroundGeneratedOn(locale);
  const { changed, unchanged } = LOCK_DEMO_COUNTS;
  const sourceFile = playgroundFileName(PLAYGROUND_SOURCE_LOCALE);
  const targetFile = playgroundFileName(LOCK_DEMO_LOCALE);
  const edit: LockDemoStep = {
    id: "lock-demo-edit",
    label: t("edit.label"),
    text: t("edit.text", { count: changed }),
    dwellMs: 5000,
  };
  const compare: LockDemoStep = {
    id: "lock-demo-compare",
    label: t("compare.label"),
    text: t("compare.text", { count: changed }),
    dwellMs: 8000,
  };
  const send: LockDemoStep = {
    id: "lock-demo-send",
    label: t("send.label"),
    text: t("send.text", { count: changed, rest: unchanged }),
    dwellMs: 6000,
  };

  return (
    <Section id="lock-demo" labelledBy={LOCK_DEMO_HEADING_ID} className="vk-lock">
      <p className="vk-eyebrow">{t("label")}</p>
      <SectionHead id={LOCK_DEMO_HEADING_ID} title={t("heading", { count: changed })} />
      <LockDemoMotion
        steps={[edit, compare, send]}
        labels={{ steps: t("steps"), pause: t("pause"), play: t("play") }}
      >
        <Frame
          step={edit}
          file={sourceFile}
          badge={t("badge.changed", { count: changed })}
          foot={null}
        >
          <Code lines={lockDemoSourceLines()} t={t} valueLang={PLAYGROUND_SOURCE_LOCALE} />
        </Frame>
        <Frame
          step={compare}
          file={LOCK_FILE_NAME}
          badge={HERO_CHECK_BADGE}
          badgeLang="en"
          foot={
            <p className="vk-lock-foot">
              {t("foot.compare", { file: sourceFile, count: unchanged })}
            </p>
          }
        >
          <Code lines={lockLines()} t={t} />
        </Frame>
        <Frame
          step={send}
          file={HERO_TRANSLATE_OUTPUT[0] ?? ""}
          badge={HERO_TRANSLATE_BADGE}
          badgeLang="en"
          headFold
          foot={
            <p className="vk-lock-foot">
              <span lang="en">{PLAYGROUND_METADATA.model}</span>
              {", "}
              <time dateTime={generated.iso}>{t("foot.generated", { date: generated.text })}</time>
              <span className="vk-lock-foot-lock">
                <br />
                {t("foot.lock", { file: LOCK_FILE_NAME, count: changed })}
              </span>
            </p>
          }
        >
          <pre className="vk-lock-code vk-lock-cli" lang="en">
            <code>
              <span className="vk-lock-line">{`$ ${HERO_TRANSLATE_COMMAND}\n`}</span>
              <span className="vk-lock-line">{`  ${HERO_TRANSLATE_LOCALE_LINES[0] ?? ""}`}</span>
            </code>
          </pre>
          <p className="vk-lock-sub">
            <span lang="en">{targetFile}</span>{" "}
            <span className="vk-lock-label">{t("preGenerated")}</span>
          </p>
          <Code lines={lockDemoTranslationLines()} t={t} valueLang={LOCK_DEMO_LOCALE} />
        </Frame>
      </LockDemoMotion>
    </Section>
  );
}
