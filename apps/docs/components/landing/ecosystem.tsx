import { getLocale, getTranslations } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
import { TrackedLink } from "@/components/ui/tracked-link";
import { localizedPath, toLocale } from "@/lib/i18n";
import { HUMAN_ONLY_PROVIDER, providerGroups } from "@/lib/landing-providers";
import { FORMAT_PANE_ROWS_STYLE } from "./format-pane";
import { FormatsDemo } from "./formats";
import { Section } from "./section";
import { SectionHead } from "./section-head";

const PROVIDERS_SPAN = { "--grid-span": 4 } as CSSProperties;
const FORMATS_SPAN = { "--grid-span": 8 } as CSSProperties;

const SUBHEAD_CLASS = "vk-h4 text-[color:var(--text-strong)]";
const KIND_CLASS = "text-sm font-medium text-[color:var(--text-muted)]";
const ID_CLASS = "font-mono text-xs text-[color:var(--text-faint)]";

function ProviderItem({ label, id }: { label: string; id: string }): ReactNode {
  return (
    <li className="grid gap-0.5">
      <span className="text-base text-[color:var(--text-strong)]">{label}</span>
      <code className={ID_CLASS}>{id}</code>
    </li>
  );
}

export async function Ecosystem(): Promise<ReactNode> {
  const t = await getTranslations("landing");
  const locale = toLocale(await getLocale());

  return (
    <Section band id="ecosystem">
      <SectionHead
        id="ecosystem-heading"
        title={t("ecosystem.heading")}
        lead={t("ecosystem.lead")}
      />
      <div className="vk-grid-12 not-prose mt-10 gap-y-14">
        <section
          aria-labelledby="ecosystem-providers"
          className="grid content-start gap-8"
          style={PROVIDERS_SPAN}
        >
          <h3 id="ecosystem-providers" className={SUBHEAD_CLASS}>
            {t("ecosystem.providersLabel")}
          </h3>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-1">
            {providerGroups().map((group) => (
              <div key={group.kind} className="grid content-start gap-3">
                <h4 className={KIND_CLASS}>{t(`ecosystem.kinds.${group.kind}`)}</h4>
                <ul
                  // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from a list-style: none list
                  role="list"
                  className="grid gap-3 border-l pl-4"
                  style={{ borderColor: "var(--border-default)" }}
                >
                  {group.providers.map((provider) => (
                    <ProviderItem key={provider.id} label={provider.label} id={provider.id} />
                  ))}
                </ul>
              </div>
            ))}
            <div className="grid content-start gap-3">
              <h4 className={KIND_CLASS}>{t("ecosystem.kinds.human")}</h4>
              <p className="border-l pl-4" style={{ borderColor: "var(--accent)" }}>
                <TrackedLink
                  href={localizedPath(locale, "/docs/human-only-workflow")}
                  className="vk-prose-link inline-flex min-h-6 items-center font-mono text-sm"
                >
                  {HUMAN_ONLY_PROVIDER}
                </TrackedLink>
              </p>
            </div>
          </div>
          <p className="text-sm">
            <TrackedLink
              href={localizedPath(locale, "/docs/providers")}
              className="vk-prose-link inline-flex min-h-6 items-center"
            >
              {t("ecosystem.providersLink")}
            </TrackedLink>
          </p>
        </section>
        <section
          aria-labelledby="ecosystem-formats"
          className="grid min-w-0 content-start gap-6"
          style={FORMATS_SPAN}
        >
          <h3 id="ecosystem-formats" className={SUBHEAD_CLASS}>
            {t("ecosystem.formatsLabel")}
          </h3>
          <div className="vk-formats" style={FORMAT_PANE_ROWS_STYLE}>
            <FormatsDemo
              labels={{
                frameworks: t("ecosystem.frameworksLabel"),
                formats: t("ecosystem.formatsLabel"),
              }}
            />
          </div>
          <p className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <TrackedLink
              href={localizedPath(locale, "/docs/formats")}
              className="vk-prose-link inline-flex min-h-6 items-center"
            >
              {t("ecosystem.formatsLink")}
            </TrackedLink>
            <TrackedLink
              href={localizedPath(locale, "/docs/custom-format-adapters")}
              className="vk-prose-link inline-flex min-h-6 items-center"
            >
              {t("ecosystem.customFormat")}
            </TrackedLink>
          </p>
        </section>
      </div>
    </Section>
  );
}
