import { getLocale, getTranslations } from "next-intl/server";
import { Fragment, type ReactNode } from "react";
import {
  type AvailableFromCopy,
  AvailableFromPill,
  availableFromCopy,
} from "@/components/available-from";
import { IntentPrefetchLink } from "@/components/ui/intent-prefetch-link";
import { PanelCaption } from "@/components/ui/panel-caption";
import { splitOnPlaceholder } from "@/lib/format-samples";
import { type Locale, localizedPath, toLocale } from "@/lib/i18n";
import { withInlineCode } from "@/lib/inline-code-text";
import {
  BENTO_FORMAT_LINES,
  BENTO_KEY_ENV_VARS,
  BENTO_KEYS_LINK,
  BENTO_NONE_PROVIDER,
  BENTO_PROVIDER_DIFF,
  BENTO_QUICKSTART_PAGE,
  BENTO_RUN_SUMMARY_CODE,
  BENTO_SAFETY_LINK,
  BENTO_TILES,
  type BentoDiffLine,
  type BentoKey,
  type BentoTile,
  bentoHref,
} from "@/lib/landing-bento";
import { FORMAT_DISPLAY, MACHINE_PROVIDER_IDS } from "@/lib/landing-facts";
import { featureReleaseBadge, providerReleaseBadge } from "@/lib/release-badge";
import { STACK_IDS, STACKS } from "@/lib/stacks";
import { CodeFrame } from "./code-frame";
import { Evidence } from "./evidence";
import { PlaceholderChip } from "./placeholder-chip";
import { PlainList } from "./plain-list";
import { ScrollBlock } from "./scroll-block";
import { Section } from "./section";
import { SectionHead } from "./section-head";

type BentoTranslator = Awaited<ReturnType<typeof getTranslations<"landing.bento">>>;

type TileContext = {
  readonly t: BentoTranslator;
  readonly locale: Locale;
  readonly badge: (version: string | null) => Promise<AvailableFromCopy | null>;
};

const SPAN_CLASS: Readonly<Record<BentoTile["span"], string>> = {
  4: "lg:col-span-4",
  6: "lg:col-span-6",
  8: "lg:col-span-8",
  12: "lg:col-span-12",
};

const PANEL_FRAME =
  "min-w-0 overflow-hidden rounded-xl border border-(--border-default) bg-(--v-void)";

const PANEL_CAPTION = "font-mono text-xs text-(--text-muted)";

const MONO_BODY = "vk-mono-sm py-3 font-mono leading-6";

const TILE_CLASS =
  "flex min-w-0 flex-col gap-4 rounded-xl border border-(--border-default) bg-(--surface-bg) p-4 sm:gap-5 sm:p-6";

const STRIP_CLASS =
  "vk-grid-12 min-w-0 border-t border-(--border-default) pt-6 sm:pt-8 lg:items-baseline";

const captionId = (artifact: string) => `bento-${artifact}-caption`;

function SampleLine({ line, placeholder }: { line: string; placeholder: string }): ReactNode {
  return splitOnPlaceholder(line, placeholder).map((part, index) => (
    <Fragment key={`${index}:${part}`}>
      {part === placeholder ? <PlaceholderChip token={part} /> : part}
    </Fragment>
  ));
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

function EvidenceRow({ tile, locale }: { tile: BentoTile; locale: Locale }): ReactNode {
  if (tile.evidence.length === 0) return null;
  return (
    <PlainList className="flex list-none flex-wrap gap-2">
      {tile.evidence.map((item) => (
        <li key={item.text} className="min-w-0 max-w-full">
          <Evidence text={item.text} href={bentoHref(locale, item)} />
        </li>
      ))}
    </PlainList>
  );
}

function TileHead({ tile, t }: { tile: BentoTile; t: BentoTranslator }): ReactNode {
  return (
    <div className="grid gap-2">
      <h3 className="vk-h4 text-(--text-strong)">{t(`items.${tile.key}.title`)}</h3>
      <p className="max-w-[52ch] text-sm leading-relaxed text-(--text-muted)">
        {withInlineCode(t(`items.${tile.key}.body`))}
      </p>
    </div>
  );
}

async function ProvidersTile({ tile, t, locale, badge }: TileContext & { tile: BentoTile }) {
  const none = await badge(featureReleaseBadge("provider-none"));
  return (
    <>
      <TileHead tile={tile} t={t} />
      <ProviderSwitch />
      <EvidenceRow tile={tile} locale={locale} />
      <div
        data-none-provider=""
        className="mt-auto grid gap-2 border-t border-(--border-default) pt-4"
      >
        <p className="max-w-[52ch] text-sm leading-relaxed text-(--text-muted)">
          {t("items.providers.none")}
        </p>
        <span className="flex flex-wrap items-center gap-2">
          <Evidence text={BENTO_NONE_PROVIDER.text} href={bentoHref(locale, BENTO_NONE_PROVIDER)} />
          {none ? <AvailableFromPill {...none} /> : null}
        </span>
      </div>
    </>
  );
}

async function KeysTile({ tile, t, locale, badge }: TileContext & { tile: BentoTile }) {
  const variables = await Promise.all(
    MACHINE_PROVIDER_IDS.map(async (id) => ({
      id,
      ...BENTO_KEY_ENV_VARS[id],
      badge: await badge(providerReleaseBadge(id)),
    })),
  );
  return (
    <>
      <TileHead tile={tile} t={t} />
      <figure data-artifact="keys" className={`${PANEL_FRAME} m-0`}>
        <PanelCaption
          as="figcaption"
          density="control"
          id={captionId("keys")}
          className={PANEL_CAPTION}
        >
          {t("items.keys.variables")}
        </PanelCaption>
        <PlainList aria-labelledby={captionId("keys")} className="grid list-none gap-1.5 px-4 py-3">
          {variables.map((variable) => (
            <li
              key={variable.id}
              data-provider={variable.id}
              className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
            >
              <code
                lang="en"
                className="vk-mono-sm font-mono text-(--text-strong) [overflow-wrap:anywhere]"
              >
                {variable.name}
              </code>
              {variable.optional ? (
                <span className="text-xs text-(--text-muted)">{t("items.keys.optional")}</span>
              ) : null}
              {variable.badge ? <AvailableFromPill {...variable.badge} /> : null}
            </li>
          ))}
        </PlainList>
      </figure>
      <PlainList className="grid list-none gap-2 text-sm leading-relaxed text-(--text-body)">
        {(["data", "integrity", "errors"] as const).map((claim) => (
          <li key={claim} data-claim={claim} className="border-s-2 border-(--border-default) ps-3">
            {t(`items.keys.claims.${claim}`)}
          </li>
        ))}
      </PlainList>
      <p className="mt-auto flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <IntentPrefetchLink href={bentoHref(locale, BENTO_KEYS_LINK)} className="vk-prose-link">
          {t("items.keys.keysLink")}
        </IntentPrefetchLink>
        <IntentPrefetchLink href={bentoHref(locale, BENTO_SAFETY_LINK)} className="vk-prose-link">
          {t("items.keys.safetyLink")}
        </IntentPrefetchLink>
      </p>
    </>
  );
}

async function ArtifactTile({ tile, t, locale }: TileContext & { tile: BentoTile }) {
  const artifact =
    tile.key === "formats" ? (
      <FormatKeyLines />
    ) : (
      await CodeFrame({ code: BENTO_RUN_SUMMARY_CODE, lang: "ts", filename: "@verbatra/sdk" })
    );
  return (
    <>
      <TileHead tile={tile} t={t} />
      <div className="flex min-w-0 flex-1 flex-col [&>*]:flex-1">{artifact}</div>
      <EvidenceRow tile={tile} locale={locale} />
    </>
  );
}

function FrameworksStrip({ t, locale }: TileContext): ReactNode {
  return (
    <>
      <div className="grid gap-2 lg:[--grid-span:5]">
        <h3 id="bento-frameworks-heading" className="vk-h4 text-(--text-strong)">
          {t("items.frameworks.title")}
        </h3>
        <p className="max-w-[52ch] text-sm leading-relaxed text-(--text-muted)">
          {t("items.frameworks.body")}
        </p>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3 lg:[--grid-span:7]">
        <PlainList
          aria-labelledby="bento-frameworks-heading"
          className="flex list-none flex-wrap gap-x-6 gap-y-3 text-base"
        >
          {STACK_IDS.map((id) => (
            <li key={id} data-stack={id}>
              <IntentPrefetchLink
                href={localizedPath(locale, `${BENTO_QUICKSTART_PAGE}/${id}`)}
                className="vk-prose-link"
              >
                {STACKS[id].name}
              </IntentPrefetchLink>
            </li>
          ))}
        </PlainList>
        <IntentPrefetchLink
          href={localizedPath(locale, BENTO_QUICKSTART_PAGE)}
          className="vk-prose-link text-sm"
        >
          {t("items.frameworks.all")}
        </IntentPrefetchLink>
      </div>
    </>
  );
}

const TILE_BODY: Readonly<
  Record<BentoKey, (props: TileContext & { tile: BentoTile }) => ReactNode | Promise<ReactNode>>
> = {
  providers: ProvidersTile,
  keys: KeysTile,
  formats: ArtifactTile,
  sdk: ArtifactTile,
  frameworks: FrameworksStrip,
};

export async function Bento(): Promise<ReactNode> {
  const t = await getTranslations("landing.bento");
  const locale = toLocale(await getLocale());
  const context: TileContext = {
    t,
    locale,
    badge: async (version) =>
      version === null ? null : availableFromCopy(version, undefined, locale),
  };
  const bodies = await Promise.all(
    BENTO_TILES.map((tile) => TILE_BODY[tile.key]({ ...context, tile })),
  );
  return (
    <Section id="features" labelledBy="features-heading">
      <SectionHead id="features-heading" title={t("heading")} lead={t("lead")} />
      <PlainList
        data-reveal="2"
        className="mt-(--head-gap) grid list-none grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12"
      >
        {BENTO_TILES.map((tile, index) => (
          <li
            key={tile.key}
            data-tile={tile.key}
            className={`${tile.span === 12 ? STRIP_CLASS : TILE_CLASS} ${SPAN_CLASS[tile.span]}`}
          >
            {bodies[index]}
          </li>
        ))}
      </PlainList>
    </Section>
  );
}
