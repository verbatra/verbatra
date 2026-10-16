import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CONTRIBUTORS, type Contributor } from "@/lib/contributors";
import { CONTRIBUTION_STEPS, OPEN_SOURCE_LINKS } from "@/lib/landing-open-source";
import { GITHUB_URL } from "./links";
import { PlainList } from "./plain-list";
import { Section } from "./section";
import { SectionHead } from "./section-head";

const AVATAR_SIZE = 32;

function OutboundLink({
  href,
  newTab,
  className,
  children,
}: {
  href: string;
  newTab: string;
  className: string;
  children: ReactNode;
}): ReactNode {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={className}>
      {children}
      <span className="sr-only"> {newTab}</span>
    </a>
  );
}

export function Contributors({
  contributors,
  title,
  ariaFor,
  newTab,
}: {
  contributors: ReadonlyArray<Contributor>;
  title: string;
  ariaFor: (login: string) => string;
  newTab: string;
}): ReactNode {
  if (contributors.length === 0) return null;
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset groups form controls; this names a list of profile links without adding a landmark
    <div role="group" aria-labelledby="open-source-contributors" className="vk-contribute-people">
      <h3 id="open-source-contributors" className="vk-contribute-label">
        {title}
      </h3>
      <PlainList className="vk-contribute-avatars">
        {contributors.map((contributor) => (
          <li key={contributor.login}>
            <OutboundLink
              href={contributor.profileUrl}
              newTab={newTab}
              className="vk-contribute-person"
            >
              <Image
                src={contributor.avatarPath}
                alt=""
                width={AVATAR_SIZE}
                height={AVATAR_SIZE}
                className="vk-contribute-avatar"
              />
              <span className="sr-only">{ariaFor(contributor.login)}</span>
              <span aria-hidden="true" className="font-mono text-sm">
                {contributor.login}
              </span>
            </OutboundLink>
          </li>
        ))}
      </PlainList>
    </div>
  );
}

export async function OpenSource(): Promise<ReactNode> {
  const t = await getTranslations("landing.openSource");
  const newTab = t("newTab");

  return (
    <Section band id="open-source" labelledBy="open-source-heading">
      <SectionHead
        id="open-source-heading"
        title={t("heading")}
        lead={t("lead")}
        layout="stacked"
      />
      <ol className="vk-contribute-steps vk-grid-12 not-prose mt-(--head-gap)">
        {CONTRIBUTION_STEPS.map((step, index) => (
          <li key={step.id} className="vk-contribute-step" data-step={step.id}>
            <span aria-hidden="true" className="vk-contribute-mark">
              {index + 1}
            </span>
            <h3 className="vk-h4 text-(--text-strong)">{t(`steps.${step.id}.title`)}</h3>
            <p className="vk-contribute-body">{t(`steps.${step.id}.body`)}</p>
            <code lang="en" className="vk-contribute-command">
              {step.command}
            </code>
          </li>
        ))}
      </ol>
      <div className="vk-contribute-foot vk-grid-12 not-prose">
        <nav aria-labelledby="open-source-links" className="vk-contribute-links">
          <h3 id="open-source-links" className="vk-contribute-label">
            {t("linksHeading")}
          </h3>
          <PlainList className="vk-contribute-link-list">
            <li>
              <OutboundLink href={GITHUB_URL} newTab={newTab} className="vk-prose-link">
                <span className="font-mono text-sm">verbatra/verbatra</span>
              </OutboundLink>
            </li>
            {OPEN_SOURCE_LINKS.map((link) => (
              <li key={link.key}>
                <OutboundLink href={link.href} newTab={newTab} className="vk-prose-link">
                  {t(link.key)}
                </OutboundLink>
              </li>
            ))}
          </PlainList>
        </nav>
        <Contributors
          contributors={CONTRIBUTORS}
          title={t("contributorsHeading")}
          ariaFor={(login) => t("contributorAria", { name: login })}
          newTab={newTab}
        />
      </div>
    </Section>
  );
}
