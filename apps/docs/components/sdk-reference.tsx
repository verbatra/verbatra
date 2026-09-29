import { flattenTree } from "fumadocs-core/page-tree";
import { Card, Cards } from "fumadocs-ui/components/card";
import type { MDXComponents } from "mdx/types";
import { LINK_CARD_CLASS } from "@/components/mdx";
import { SdkAnchorForwarder } from "@/components/sdk-anchor-forward";
import { type Locale, localizedPath } from "@/lib/i18n";
import {
  entryHeadings,
  isIdentifier,
  type SdkHeading,
  type SdkReferencePage,
  sdkAnchorTargets,
  tocHeading,
} from "@/lib/sdk-anchors";
import { source } from "@/lib/source";

export function sdkReferencePages(locale: Locale): SdkReferencePage[] {
  const folder = localizedPath(locale, "/docs/sdk/");
  const pages = new Map(source.getPages(locale).map((page) => [page.url, page]));
  return flattenTree(source.getPageTree(locale).children).flatMap((item) => {
    const page = item.url.startsWith(folder) ? pages.get(item.url) : undefined;
    if (page === undefined) return [];
    return [{ url: page.url, title: page.data.title, headings: page.data.toc.map(tocHeading) }];
  });
}

function EntryName({ heading }: { heading: SdkHeading }) {
  return isIdentifier(heading.title) ? <code>{heading.title}</code> : <>{heading.title}</>;
}

export function SdkEntryPoints({ locale }: { locale: Locale }) {
  return (
    <Cards>
      {sdkReferencePages(locale).map((page) => (
        <Card key={page.url} title={page.title} href={page.url} className={LINK_CARD_CLASS}>
          {entryHeadings(page).map((heading, position) => (
            <span key={heading.anchor}>
              {position > 0 ? ", " : null}
              <EntryName heading={heading} />
            </span>
          ))}
        </Card>
      ))}
    </Cards>
  );
}

export function SdkAnchorForward({ locale }: { locale: Locale }) {
  return <SdkAnchorForwarder targets={sdkAnchorTargets(sdkReferencePages(locale))} />;
}

export function sdkReferenceComponents(locale: Locale) {
  return {
    SdkEntryPoints: () => <SdkEntryPoints locale={locale} />,
    SdkAnchorForward: () => <SdkAnchorForward locale={locale} />,
  } satisfies MDXComponents;
}
