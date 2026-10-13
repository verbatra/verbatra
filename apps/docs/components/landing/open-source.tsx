import { ArrowUpRightIcon } from "lucide-react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
import { CONTRIBUTORS, type Contributor } from "@/lib/contributors";
import { GithubIcon } from "./github-icon";
import {
  CODE_OF_CONDUCT_URL,
  CONTRIBUTING_URL,
  GITHUB_URL,
  ISSUES_URL,
  LICENSE_URL,
  RELEASES_URL,
  ROADMAP_URL,
  SECURITY_URL,
} from "./links";
import { Section } from "./section";
import { SectionHead } from "./section-head";

const AVATAR_SIZE = 40;

const LINKS_SPAN = { "--grid-span": 7 } as CSSProperties;
const PEOPLE_SPAN = { "--grid-span": 5 } as CSSProperties;

type ProjectLink = { key: string; href: string };

export const OPEN_SOURCE_LINKS: ReadonlyArray<ProjectLink> = [
  { key: "license", href: LICENSE_URL },
  { key: "contributing", href: CONTRIBUTING_URL },
  { key: "codeOfConduct", href: CODE_OF_CONDUCT_URL },
  { key: "security", href: SECURITY_URL },
  { key: "issues", href: ISSUES_URL },
  { key: "roadmap", href: ROADMAP_URL },
  { key: "releases", href: RELEASES_URL },
];

const ROW_CLASS =
  "flex min-h-12 items-center justify-between gap-4 border-t py-3 text-base text-[color:var(--text-strong)] underline decoration-transparent underline-offset-4 transition-colors hover:text-[color:var(--accent)] hover:decoration-[color:var(--accent)]";

function OutboundRow({
  href,
  newTab,
  children,
}: {
  href: string;
  newTab: string;
  children: ReactNode;
}): ReactNode {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={ROW_CLASS}
      style={{ borderColor: "var(--border-default)" }}
    >
      <span>
        {children}
        <span className="sr-only"> {newTab}</span>
      </span>
      <ArrowUpRightIcon
        aria-hidden="true"
        className="size-4 shrink-0 text-[color:var(--text-muted)]"
        data-external
      />
    </a>
  );
}

export function Contributors({
  contributors,
  title,
  ariaFor,
}: {
  contributors: ReadonlyArray<Contributor>;
  title: string;
  ariaFor: (login: string) => string;
}): ReactNode {
  if (contributors.length === 0) return null;
  return (
    <section aria-labelledby="open-source-contributors" className="grid content-start gap-4">
      <h3 id="open-source-contributors" className="vk-h4 text-[color:var(--text-strong)]">
        {title}
      </h3>
      <ul
        // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from a list-style: none list
        role="list"
        className="flex flex-wrap gap-3"
      >
        {contributors.map((contributor) => (
          <li key={contributor.login}>
            <a
              href={contributor.profileUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="block rounded-full"
            >
              <Image
                src={contributor.avatarPath}
                alt={ariaFor(contributor.login)}
                width={AVATAR_SIZE}
                height={AVATAR_SIZE}
                className="size-10 rounded-full border"
                style={{ borderColor: "var(--border-default)" }}
              />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export async function OpenSource(): Promise<ReactNode> {
  const t = await getTranslations("landing.openSource");

  return (
    <Section width="wide" rhythm="md" id="open-source">
      <SectionHead id="open-source-heading" title={t("heading")} lead={t("lead")} />
      <div className="vk-grid-12 not-prose mt-10 gap-y-12">
        <ul
          // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from a list-style: none list
          role="list"
          className="grid border-b"
          style={{ ...LINKS_SPAN, borderColor: "var(--border-default)" }}
        >
          <li>
            <OutboundRow href={GITHUB_URL} newTab={t("newTab")}>
              <span className="inline-flex items-center gap-3">
                <GithubIcon size={18} />
                <span className="font-mono text-sm">verbatra/verbatra</span>
              </span>
            </OutboundRow>
          </li>
          {OPEN_SOURCE_LINKS.map((link) => (
            <li key={link.key}>
              <OutboundRow href={link.href} newTab={t("newTab")}>
                {t(link.key)}
              </OutboundRow>
            </li>
          ))}
        </ul>
        <div style={PEOPLE_SPAN}>
          <Contributors
            contributors={CONTRIBUTORS}
            title={t("contributorsHeading")}
            ariaFor={(login) => t("contributorAria", { name: login })}
          />
        </div>
      </div>
    </Section>
  );
}
