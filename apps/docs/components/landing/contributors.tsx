import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CONTRIBUTORS, type Contributor } from "@/lib/contributors";
import { ISSUES_URL } from "./links";
import { PlainList } from "./plain-list";

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

type ContributorSlot = { readonly label: string; readonly hint: string };

function Contributors({
  contributors,
  title,
  ariaFor,
  newTab,
  slot,
}: {
  contributors: ReadonlyArray<Contributor>;
  title: string;
  ariaFor: (login: string) => string;
  newTab: string;
  slot: ContributorSlot;
}): ReactNode {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset groups form controls; this names a list of profile links without adding a landmark
    <div role="group" aria-labelledby="footer-contributors" className="vk-contribute-people">
      <p id="footer-contributors" className="vk-footer-group-title">
        {title}
      </p>
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
        <li data-contributor-slot="">
          <OutboundLink
            href={ISSUES_URL}
            newTab={newTab}
            className="vk-contribute-person vk-contribute-slot"
          >
            <span aria-hidden="true" className="vk-contribute-slot-mark" />
            <span className="text-sm">{slot.label}</span>
            <span className="sr-only">, {slot.hint}</span>
          </OutboundLink>
        </li>
      </PlainList>
    </div>
  );
}

export async function FooterContributors(
  contributors: ReadonlyArray<Contributor> = CONTRIBUTORS,
): Promise<ReactNode> {
  if (contributors.length === 0) return null;
  const t = await getTranslations("landing.openSource");
  return (
    <Contributors
      contributors={contributors}
      title={t("contributorsHeading")}
      ariaFor={(login) => t("contributorAria", { name: login })}
      newTab={t("newTab")}
      slot={{ label: t("contributorSlot"), hint: t("contributorSlotHint") }}
    />
  );
}
