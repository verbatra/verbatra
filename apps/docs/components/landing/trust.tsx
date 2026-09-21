import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import {
  CODECOV_URL,
  ENV_SOURCE_URL,
  GITHUB_URL,
  LICENSE_URL,
  RELEASE_WORKFLOW_URL,
} from "./links";
import { Section } from "./section";
import { SectionHead } from "./section-head";

const COVERAGE_BADGE =
  "https://img.shields.io/codecov/c/github/verbatra/verbatra?label=coverage&style=flat&labelColor=1b1b2b&color=9c27b0";

type TrustRow = {
  key: string;
  href: string;
  badge?: boolean;
};

const TRUST_ROWS: ReadonlyArray<TrustRow> = [
  { key: "license", href: LICENSE_URL },
  { key: "local", href: ENV_SOURCE_URL },
  { key: "provenance", href: RELEASE_WORKFLOW_URL },
  { key: "coverage", href: CODECOV_URL, badge: true },
  { key: "cost", href: GITHUB_URL },
];

export async function Trust(): Promise<ReactNode> {
  const t = await getTranslations("landing.trust");

  return (
    <Section width="content" rhythm="md">
      <SectionHead title={t("heading")} lead={t("lead")} />
      <dl className="mt-10 border-t border-fd-border">
        {TRUST_ROWS.map((row) => (
          <div
            key={row.key}
            className="grid gap-x-8 gap-y-2 border-b border-fd-border py-5 md:grid-cols-[200px_1fr_auto] md:items-baseline"
          >
            <dt
              className="font-semibold text-fd-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t(`rows.${row.key}.label`)}
            </dt>
            <dd className="text-sm leading-relaxed text-fd-muted-foreground">
              <span className="block font-medium text-fd-foreground">
                {row.badge ? (
                  <a
                    href={row.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-h-6 items-center"
                  >
                    {/* biome-ignore lint/performance/noImgElement: external SVG badge endpoints are not optimizable by next/image. */}
                    <img
                      src={COVERAGE_BADGE}
                      alt={t(`rows.${row.key}.value`)}
                      width={112}
                      height={20}
                      className="block h-5 w-auto"
                      loading="lazy"
                    />
                  </a>
                ) : (
                  t(`rows.${row.key}.value`)
                )}
              </span>
              <span className="mt-1 block">{t(`rows.${row.key}.detail`)}</span>
            </dd>
            <dd className="md:text-right">
              <a
                href={row.href}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-6 items-center text-sm font-medium text-[color:var(--accent)] underline underline-offset-4"
              >
                {t(`rows.${row.key}.cta`)}
                <span aria-hidden="true" className="ml-1">
                  ↗
                </span>
              </a>
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
