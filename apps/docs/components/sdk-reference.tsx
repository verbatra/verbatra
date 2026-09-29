import { flattenTree } from "fumadocs-core/page-tree";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import type { ComponentProps } from "react";
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

const Table = defaultMdxComponents.table ?? "table";

export function sdkReferencePages(locale: Locale): SdkReferencePage[] {
  const folder = localizedPath(locale, "/docs/sdk/");
  const pages = new Map(source.getPages(locale).map((page) => [page.url, page]));
  return flattenTree(source.getPageTree(locale).children).flatMap((item) => {
    const page = item.url.startsWith(folder) ? pages.get(item.url) : undefined;
    if (page === undefined) return [];
    return [{ url: page.url, title: page.data.title, headings: page.data.toc.map(tocHeading) }];
  });
}

function EntryLink({ url, heading }: { url: string; heading: SdkHeading }) {
  return (
    <Link href={`${url}#${heading.anchor}`}>
      {isIdentifier(heading.title) ? <code>{heading.title}</code> : heading.title}
    </Link>
  );
}

export function SdkEntryPoints({
  locale,
  pageLabel,
  entriesLabel,
}: {
  locale: Locale;
  pageLabel: string;
  entriesLabel: string;
}) {
  return (
    <Table>
      <thead>
        <tr>
          <th>{pageLabel}</th>
          <th>{entriesLabel}</th>
        </tr>
      </thead>
      <tbody>
        {sdkReferencePages(locale).map((page) => (
          <tr key={page.url}>
            <td>
              <Link href={page.url}>{page.title}</Link>
            </td>
            <td>
              {entryHeadings(page).map((heading, position) => (
                <span key={heading.anchor}>
                  {position > 0 ? ", " : null}
                  <EntryLink url={page.url} heading={heading} />
                </span>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function SdkAnchorForward({ locale }: { locale: Locale }) {
  return <SdkAnchorForwarder targets={sdkAnchorTargets(sdkReferencePages(locale))} />;
}

export function sdkReferenceComponents(locale: Locale) {
  return {
    SdkEntryPoints: (props: Omit<ComponentProps<typeof SdkEntryPoints>, "locale">) => (
      <SdkEntryPoints {...props} locale={locale} />
    ),
    SdkAnchorForward: () => <SdkAnchorForward locale={locale} />,
  } satisfies MDXComponents;
}
