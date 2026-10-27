import type { LinkItemType } from "fumadocs-ui/layouts/shared";
import { GithubIcon } from "@/components/landing/github-icon";
import { GITHUB_URL } from "@/components/landing/links";
import { type Locale, localizedPath } from "@/lib/i18n";

export function headerLinks(
  locale: Locale,
  labels: { docs: string; reference: string },
): LinkItemType[] {
  return [
    { text: labels.docs, url: localizedPath(locale, "/docs") },
    { text: labels.reference, url: localizedPath(locale, "/docs/cli") },
    {
      type: "icon",
      label: "GitHub",
      text: "GitHub",
      icon: <GithubIcon />,
      url: GITHUB_URL,
      external: true,
    },
  ];
}

export type NavLink = {
  readonly href: string;
  readonly text: string;
  readonly external: boolean;
  readonly active: "url" | "nested-url" | "none" | undefined;
};

export function navLinks(items: ReadonlyArray<LinkItemType>): ReadonlyArray<NavLink> {
  return items.flatMap((item) => {
    if (item.type === "custom" || item.type === "menu" || !("url" in item) || !item.url) return [];
    const text = item.type === "icon" ? item.label : item.text;
    if (typeof text !== "string" || text === "") return [];
    return [{ href: item.url, text, external: item.external === true, active: item.active }];
  });
}
