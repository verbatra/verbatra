import { getLocale, getTranslations } from "next-intl/server";
import { Fragment, type ReactNode } from "react";
import { PanelCaption } from "@/components/ui/panel-caption";
import { splitOnPlaceholder } from "@/lib/format-samples";
import { GATE_RUN_LINES } from "@/lib/gate-demo";
import { HERO_TERMINAL_TITLE } from "@/lib/hero-terminal";
import { toLocale } from "@/lib/i18n";
import { withInlineCode } from "@/lib/inline-code-text";
import {
  BENTO_ACTION_ANNOTATION,
  BENTO_ACTION_FILE,
  BENTO_ACTION_TRIGGERS,
  BENTO_ADAPTER_CODE,
  BENTO_FORMAT_LINES,
  BENTO_KEYS_CODE,
  BENTO_LOCK_CODE,
  BENTO_PROVIDER_DIFF,
  BENTO_TILES,
  type BentoDiffLine,
  type BentoKey,
  type BentoTile,
  bentoHref,
} from "@/lib/landing-bento";
import { FORMAT_DISPLAY } from "@/lib/landing-facts";
import { CodeFrame } from "./code-frame";
import { Evidence } from "./evidence";
import { PlaceholderChip, PlaceholderText } from "./placeholder-chip";
import { PlainList } from "./plain-list";
import { ScrollBlock } from "./scroll-block";
import { Section } from "./section";
import { SectionHead } from "./section-head";

function SampleLine({ line, placeholder }: { line: string; placeholder: string }): ReactNode {
  return splitOnPlaceholder(line, placeholder).map((part, index) => (
    <Fragment key={`${index}:${part}`}>
      {part === placeholder ? <PlaceholderChip token={part} /> : part}
    </Fragment>
  ));
}

const SPAN_CLASS: Readonly<Record<BentoTile["span"], string>> = {
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  7: "lg:col-span-7",
};

const PANEL_FRAME =
  "min-w-0 overflow-hidden rounded-xl border border-(--border-default) bg-(--v-void)";

const PANEL_CAPTION = "font-mono text-xs text-(--text-muted)";

const MONO_BODY = "vk-mono-sm py-3 font-mono leading-6";

const captionId = (artifact: string) => `bento-${artifact}-caption`;

function IntegrityRun(): ReactNode {
  const [command, ...output] = GATE_RUN_LINES;
  return (
    <figure className={`${PANEL_FRAME} m-0`}>
      <PanelCaption
        as="figcaption"
        density="control"
        id={captionId("integrity")}
        className={PANEL_CAPTION}
      >
        {HERO_TERMINAL_TITLE}
      </PanelCaption>
      <ScrollBlock
        lang="en"
        data-artifact="integrity"
        labelledBy={captionId("integrity")}
        className={MONO_BODY}
      >
        <div className="px-4 whitespace-pre text-(--text-strong)">
          <span aria-hidden="true" className="text-(--accent)">
            {"$ "}
          </span>
          {command}
        </div>
        {output.map((line) => (
          <div key={line} className="px-4 whitespace-pre text-(--text-muted)">
            <PlaceholderText text={line} />
          </div>
        ))}
      </ScrollBlock>
    </figure>
  );
}

const DIFF_SIGN_CLASS: Readonly<Record<BentoDiffLine["sign"], string>> = {
  " ": "text-(--text-muted)",
  "-": "bg-[color-mix(in_srgb,var(--text-danger)_10%,transparent)] text-(--text-body)",
  "+": "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--text-strong)",
};

const DIFF_MARK_CLASS: Readonly<Record<BentoDiffLine["sign"], string>> = {
  " ": "text-transparent",
  "-": "text-(--text-danger)",
  "+": "text-(--accent)",
};

function ProviderSwitch(): ReactNode {
  return (
    <figure data-artifact="providers" className={`${PANEL_FRAME} m-0`}>
      <PanelCaption
        as="figcaption"
        density="control"
        id={captionId("providers")}
        className={PANEL_CAPTION}
      >
        verbatra.config.ts
      </PanelCaption>
      <ScrollBlock lang="en" labelledBy={captionId("providers")} className={MONO_BODY}>
        {BENTO_PROVIDER_DIFF.map((line) => (
          <div
            key={`${line.sign}${line.text}`}
            data-diff={line.sign === " " ? "context" : line.sign === "-" ? "removed" : "added"}
            className={`flex whitespace-pre px-4 ${DIFF_SIGN_CLASS[line.sign]}`}
          >
            <span
              aria-hidden="true"
              className={`w-4 shrink-0 select-none ${DIFF_MARK_CLASS[line.sign]}`}
            >
              {line.sign}
            </span>
            {line.text}
          </div>
        ))}
      </ScrollBlock>
    </figure>
  );
}

function FormatKeyLines(): ReactNode {
  return (
    <PlainList
      lang="en"
      data-artifact="formats"
      className={`${PANEL_FRAME} list-none divide-y divide-(--border-default)`}
    >
      {BENTO_FORMAT_LINES.map((entry) => (
        <li key={entry.format} data-format={entry.format} className="grid min-w-0 gap-1 px-4 py-3">
          <span
            id={captionId(`format-${entry.format}`)}
            className="flex min-w-0 items-baseline justify-between gap-3 text-xs"
          >
            <span className="shrink-0 text-(--text-strong)">
              {FORMAT_DISPLAY[entry.format].label}
            </span>
            <span title={entry.file} className="min-w-0 truncate font-mono text-(--text-faint)">
              {entry.file}
            </span>
          </span>
          <ScrollBlock labelledBy={captionId(`format-${entry.format}`)}>
            <code className="vk-mono-sm block whitespace-pre font-mono text-(--text-body)">
              <SampleLine line={entry.line} placeholder={entry.placeholder} />
            </code>
          </ScrollBlock>
        </li>
      ))}
    </PlainList>
  );
}

function ActionTriggers(): ReactNode {
  return (
    <figure data-artifact="action" className={`${PANEL_FRAME} m-0`}>
      <PanelCaption as="figcaption" density="control" className={PANEL_CAPTION}>
        {BENTO_ACTION_FILE}
      </PanelCaption>
      <div className="grid gap-3 px-4 py-3">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 font-mono text-xs">
          {BENTO_ACTION_TRIGGERS.map((trigger) => (
            <div key={trigger.event} className="contents">
              <dt className="text-(--text-muted)">{`on: ${trigger.event}`}</dt>
              <dd className="m-0 text-(--text-strong)">{`command: ${trigger.command}`}</dd>
            </div>
          ))}
        </dl>
        <p
          lang="en"
          className="m-0 border-s-2 border-(--border-danger) ps-3 font-mono text-xs text-(--text-body)"
        >
          {BENTO_ACTION_ANNOTATION}
        </p>
      </div>
    </figure>
  );
}

async function tileArtifact(key: BentoKey): Promise<ReactNode> {
  switch (key) {
    case "incremental":
      return CodeFrame({ code: BENTO_LOCK_CODE, lang: "json", filename: "verbatra.lock.json" });
    case "integrity":
      return <IntegrityRun />;
    case "providers":
      return <ProviderSwitch />;
    case "keys":
      return CodeFrame({ code: BENTO_KEYS_CODE, lang: "bash", filename: HERO_TERMINAL_TITLE });
    case "action":
      return <ActionTriggers />;
    case "formats":
      return <FormatKeyLines />;
    case "adapters":
      return CodeFrame({ code: BENTO_ADAPTER_CODE, lang: "ts", filename: "translate.ts" });
  }
}

export async function Bento(): Promise<ReactNode> {
  const t = await getTranslations("landing.bento");
  const locale = toLocale(await getLocale());
  const artifacts = await Promise.all(BENTO_TILES.map((tile) => tileArtifact(tile.key)));
  return (
    <Section id="features">
      <SectionHead id="features-heading" title={t("heading")} />
      <PlainList
        data-reveal="2"
        className="mt-10 grid list-none grid-cols-1 gap-3 sm:gap-4 lg:mt-14 lg:grid-cols-12"
      >
        {BENTO_TILES.map((tile, index) => (
          <li
            key={tile.key}
            data-tile={tile.key}
            className={`flex min-w-0 flex-col gap-4 rounded-xl border border-(--border-default) bg-(--surface-bg) p-4 sm:gap-5 sm:p-6 ${SPAN_CLASS[tile.span]}`}
          >
            <div className="grid gap-2">
              <h3 className="text-base font-semibold text-(--text-strong)">
                {t(`items.${tile.key}.title`)}
              </h3>
              <p className="max-w-[52ch] text-sm leading-relaxed text-(--text-muted)">
                {withInlineCode(t(`items.${tile.key}.body`))}
              </p>
            </div>
            <div className="flex min-w-0 flex-1 flex-col [&>*]:flex-1">{artifacts[index]}</div>
            <PlainList className="flex list-none flex-wrap gap-2">
              {tile.evidence.map((item) => (
                <li key={item.text} className="min-w-0 max-w-full">
                  <Evidence text={item.text} href={bentoHref(locale, item)} />
                </li>
              ))}
            </PlainList>
          </li>
        ))}
      </PlainList>
    </Section>
  );
}
