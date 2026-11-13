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
import { Section } from "./section";
import { SectionHead } from "./section-head";

export const LOCK_DEMO_HEADING_ID = "lock-demo-heading";

export const LOCK_DEMO_DWELL_MS: ReadonlyArray<number> = [5000, 8000, 6000];

const FRAME_IDS = ["lock-demo-edit", "lock-demo-compare", "lock-demo-send"] as const;

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
  if (line.kind === "gap") {
    return (
      <span className="vk-lock-line" style={style} data-kind="gap">
        {`${t("gap", { count: line.count })}${end}`}
      </span>
    );
  }
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
    <span className="vk-lock-line" style={style} data-mark={line.mark}>
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
  index,
  label,
  text,
  file,
  badge,
  badgeLang,
  children,
  foot,
}: {
  index: number;
  label: string;
  text: string;
  file: string;
  badge: string;
  badgeLang?: string;
  children: ReactNode;
  foot: ReactNode;
}): ReactNode {
  const id = FRAME_IDS[index] ?? "";
  return (
    <figure id={id} className="vk-lock-frame" aria-labelledby={`${id}-caption`}>
      <figcaption id={`${id}-caption`} className="vk-lock-caption">
        <b>{label}</b>
        <span>{text}</span>
      </figcaption>
      <div className="vk-lock-card">
        <p className="vk-lock-head">
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
  const stepText = [
    t("edit.text", { count: changed }),
    t("compare.text", { count: changed }),
    t("send.text", { count: changed, rest: unchanged }),
  ];
  const stepLabel = [t("edit.label"), t("compare.label"), t("send.label")];

  return (
    <Section id="lock-demo" labelledBy={LOCK_DEMO_HEADING_ID} className="vk-lock">
      <p className="vk-eyebrow">{t("label")}</p>
      <SectionHead id={LOCK_DEMO_HEADING_ID} title={t("heading", { count: changed })} />
      <LockDemoMotion
        steps={FRAME_IDS.map((id, index) => ({
          id,
          label: stepLabel[index] ?? "",
          text: stepText[index] ?? "",
        }))}
        labels={{ steps: t("steps"), pause: t("pause"), play: t("play") }}
        dwellsMs={LOCK_DEMO_DWELL_MS}
      >
        <Frame
          index={0}
          label={stepLabel[0] ?? ""}
          text={stepText[0] ?? ""}
          file={sourceFile}
          badge={t("badge.changed", { count: changed })}
          foot={null}
        >
          <Code lines={lockDemoSourceLines()} t={t} />
        </Frame>
        <Frame
          index={1}
          label={stepLabel[1] ?? ""}
          text={stepText[1] ?? ""}
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
          index={2}
          label={stepLabel[2] ?? ""}
          text={stepText[2] ?? ""}
          file={HERO_TRANSLATE_OUTPUT[0] ?? ""}
          badge={HERO_TRANSLATE_BADGE}
          badgeLang="en"
          foot={
            <p className="vk-lock-foot">
              <span lang="en">{PLAYGROUND_METADATA.model}</span>
              {", "}
              <time dateTime={generated.iso}>{t("foot.generated", { date: generated.text })}</time>
              <br />
              {t("foot.lock", { file: LOCK_FILE_NAME, count: changed })}
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
