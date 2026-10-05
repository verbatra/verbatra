import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { GATE_CLI_LINE } from "@/lib/gate-demo";
import { type Locale, localizedPath } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { EVIDENCE_LINK_CLASS } from "./evidence";
import { GITHUB_URL } from "./links";
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

const PROOF_CLASS =
  "block overflow-x-auto whitespace-nowrap border-s-[3px] py-3 ps-4 pe-4 font-mono text-sm text-fd-foreground";

const PROOF_STYLE = {
  background: "var(--v-void)",
  borderInlineStartColor: "var(--v-purple)",
} as const;

function ProofLine({ text, href }: { text: string; href?: string | undefined }): ReactNode {
  if (!href) {
    return (
      <code className={PROOF_CLASS} style={PROOF_STYLE}>
        {text}
      </code>
    );
  }
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      className={cn(PROOF_CLASS, EVIDENCE_LINK_CLASS, "border-y border-e border-transparent")}
      style={PROOF_STYLE}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
    >
      {text}
    </a>
  );
}

export async function Gains(): Promise<ReactNode> {
  const t = await getTranslations("landing.gains");
  const locale = (await getLocale()) as Locale;
  const items = gains((path) => localizedPath(locale, path));
  const codeTags = {
    code: (chunks: ReactNode) => (
      <code className="whitespace-nowrap font-mono text-sm text-fd-foreground">{chunks}</code>
    ),
  };

  return (
    <Section width="wide" rhythm="lg" id="gains">
      <div>
        <SectionHead title={t("heading")} lead={t("lead")} />
      </div>
      <div>
        <dl className="mt-12 border-t border-fd-border">
          {items.map((gain) => (
            <div
              key={gain.key}
              className="grid gap-x-16 gap-y-2 border-b border-fd-border py-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center"
            >
              <dt className="vk-h4 max-w-[30ch]">{t(`items.${gain.key}.title`)}</dt>
              <dd className="m-0 max-w-[52ch] text-base leading-relaxed text-fd-muted-foreground lg:col-start-1">
                {t.rich(`items.${gain.key}.body`, codeTags)}
              </dd>
              <dd className="m-0 mt-3 grid min-w-0 gap-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0">
                <ProofLine text={gain.evidence} href={gain.href} />
                <span className="text-sm text-[color:var(--text-faint)]">
                  {t(`items.${gain.key}.note`)}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
