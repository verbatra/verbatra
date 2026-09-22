import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { GATE_CLI_LINE } from "@/lib/gate-demo";
import { type Locale, localizedPath } from "@/lib/i18n";
import { GITHUB_URL } from "./links";
import { Reveal } from "./reveal";
import { Section } from "./section";
import { SectionHead } from "./section-head";

const RUN_LINE = "de: 2 translated, 281 unchanged, 468 tokens (394 in, 74 out)";
const DOCS_CHECK_WORKFLOW = `${GITHUB_URL}/blob/main/.github/workflows/docs-i18n-check.yml`;

type GainKey = "cost" | "gate" | "ci" | "config" | "git" | "handoff";

type Gain = { key: GainKey; evidence: string; href?: string };

function gains(docs: (path: string) => string): ReadonlyArray<Gain> {
  return [
    { key: "cost", evidence: RUN_LINE },
    { key: "gate", evidence: GATE_CLI_LINE },
    { key: "ci", evidence: "docs-i18n-check.yml", href: DOCS_CHECK_WORKFLOW },
    {
      key: "config",
      evidence: 'glossary: { verbatra: "verbatra" }, tone: "informal"',
      href: docs("/docs/config-file"),
    },
    { key: "git", evidence: "verbatra.lock.json", href: docs("/docs/the-lock-file") },
    { key: "handoff", evidence: "export, import, tmx, types", href: docs("/docs/cli") },
  ];
}

const EVIDENCE_CLASS =
  "inline-block max-w-full overflow-x-auto whitespace-nowrap rounded-md border border-fd-border px-2.5 py-1.5 font-mono text-[12.5px] text-[color:var(--accent)]";

function Evidence({ gain }: { gain: Gain }): ReactNode {
  const style = { background: "var(--surface-bg)" };
  if (gain.href) {
    const external = gain.href.startsWith("http");
    return (
      <a
        href={gain.href}
        className={EVIDENCE_CLASS}
        style={style}
        {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
      >
        {gain.evidence}
      </a>
    );
  }
  return (
    <code className={EVIDENCE_CLASS} style={style}>
      {gain.evidence}
    </code>
  );
}

export async function Gains(): Promise<ReactNode> {
  const t = await getTranslations("landing.gains");
  const locale = (await getLocale()) as Locale;
  const items = gains((path) => localizedPath(locale, path));
  const codeTags = {
    code: (chunks: ReactNode) => (
      <code className="whitespace-nowrap font-mono text-[13.5px] text-fd-foreground">{chunks}</code>
    ),
  };

  return (
    <Section width="wide" rhythm="lg" id="gains">
      <Reveal>
        <SectionHead title={t("heading")} lead={t("lead")} />
      </Reveal>
      <Reveal order={1}>
        <dl className="mt-12 grid border-t border-fd-border md:grid-cols-2 md:gap-x-16">
          {items.map((gain) => (
            <div key={gain.key} className="border-b border-fd-border py-6">
              <dt
                className="max-w-[26ch] font-semibold text-fd-foreground"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.15rem",
                  lineHeight: 1.3,
                  letterSpacing: "-0.01em",
                }}
              >
                {t(`items.${gain.key}.title`)}
              </dt>
              <dd className="mt-2 max-w-[50ch] text-[15px] leading-relaxed text-fd-muted-foreground">
                {t.rich(`items.${gain.key}.body`, codeTags)}
              </dd>
              <dd className="mt-3.5 grid gap-1">
                <Evidence gain={gain} />
                <span className="text-[13px] text-[color:var(--text-faint)]">
                  {t(`items.${gain.key}.note`)}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </Section>
  );
}
