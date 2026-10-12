import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { GATE_RUN_LINES } from "@/lib/gate-demo";
import type { Locale } from "@/lib/i18n";
import { withInlineCode } from "@/lib/inline-code-text";
import {
  BENTO_ACTION_ANNOTATION,
  BENTO_ACTION_TRIGGERS,
  BENTO_ADAPTER_CODE,
  BENTO_KEYS_CODE,
  BENTO_LOCK_CODE,
  BENTO_TILES,
  type BentoKey,
  type BentoTile,
  bentoHref,
} from "@/lib/landing-bento";
import { FORMAT_DISPLAY, MACHINE_PROVIDER_IDS, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { CodeFrame } from "./code-frame";
import { Evidence } from "./evidence";
import { PlaceholderText } from "./placeholder-chip";
import { Section } from "./section";
import { SectionHead } from "./section-head";

const SPAN_CLASS: Readonly<Record<BentoTile["span"], string>> = {
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  7: "lg:col-span-7",
};

const MONO_PANEL =
  "vk-mono-sm min-w-0 overflow-x-auto rounded-xl border border-fd-border bg-(--v-void) py-3 font-mono leading-6";

const TOKEN_CLASS =
  "inline-block rounded-md border border-fd-border px-2 py-1 font-mono text-xs text-(--text-body)";

function IntegrityRun(): ReactNode {
  const [command, ...output] = GATE_RUN_LINES;
  return (
    <div lang="en" data-artifact="integrity" className={MONO_PANEL}>
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
    </div>
  );
}

function ProviderList(): ReactNode {
  return (
    <ul
      // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from a list-style: none list
      role="list"
      data-artifact="providers"
      className="flex list-none flex-wrap gap-2"
    >
      {[...MACHINE_PROVIDER_IDS, "none" as const].map((id) => (
        <li key={id} className={TOKEN_CLASS}>
          {id}
        </li>
      ))}
    </ul>
  );
}

function FormatList(): ReactNode {
  return (
    <ul
      // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from a list-style: none list
      role="list"
      data-artifact="formats"
      className="grid list-none grid-cols-1 gap-x-6 gap-y-1.5 text-sm text-(--text-body) min-[22.5rem]:grid-cols-2"
    >
      {SUPPORTED_FORMAT_IDS.map((id) => (
        <li key={id} className="min-w-0 border-b border-fd-border pb-1.5">
          {FORMAT_DISPLAY[id].label}
        </li>
      ))}
    </ul>
  );
}

function ActionTriggers(): ReactNode {
  return (
    <div data-artifact="action" className="grid gap-3">
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
  );
}

async function tileArtifact(key: BentoKey): Promise<ReactNode> {
  switch (key) {
    case "incremental":
      return CodeFrame({ code: BENTO_LOCK_CODE, lang: "json", filename: "verbatra.lock.json" });
    case "integrity":
      return <IntegrityRun />;
    case "providers":
      return <ProviderList />;
    case "keys":
      return CodeFrame({ code: BENTO_KEYS_CODE, lang: "bash" });
    case "action":
      return <ActionTriggers />;
    case "formats":
      return <FormatList />;
    case "adapters":
      return CodeFrame({ code: BENTO_ADAPTER_CODE, lang: "ts", filename: "translate.ts" });
  }
}

export async function Bento(): Promise<ReactNode> {
  const t = await getTranslations("landing.bento");
  const locale = (await getLocale()) as Locale;
  const artifacts = await Promise.all(BENTO_TILES.map((tile) => tileArtifact(tile.key)));
  return (
    <Section id="features">
      <SectionHead id="features-heading" title={t("heading")} reveal />
      <ul
        // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from a list-style: none list
        role="list"
        data-reveal="2"
        className="mt-10 grid list-none grid-cols-1 gap-4 lg:mt-14 lg:grid-cols-12"
      >
        {BENTO_TILES.map((tile, index) => (
          <li
            key={tile.key}
            data-tile={tile.key}
            className={`flex min-w-0 flex-col gap-5 rounded-xl border border-fd-border bg-(--surface-bg) p-5 sm:p-6 ${SPAN_CLASS[tile.span]}`}
          >
            <div className="grid gap-2">
              <h3 className="text-base font-semibold text-(--text-strong)">
                {t(`items.${tile.key}.title`)}
              </h3>
              <p className="max-w-[52ch] text-sm leading-relaxed text-(--text-muted)">
                {withInlineCode(t(`items.${tile.key}.body`))}
              </p>
            </div>
            <div className="min-w-0">{artifacts[index]}</div>
            <ul
              // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from a list-style: none list
              role="list"
              className="mt-auto flex list-none flex-wrap gap-2"
            >
              {tile.evidence.map((item) => (
                <li key={item.text} className="min-w-0 max-w-full">
                  <Evidence text={item.text} href={bentoHref(locale, item)} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Section>
  );
}
