import { DocsLayout } from "fumadocs-ui/layouts/notebook";
import type { ReactNode } from "react";
import { DocsSiteHeader } from "@/components/site-header";
import { withGroupLabels } from "@/lib/docs-group-labels";
import { withExpandedNewGroups, withLlmsLinks } from "@/lib/docs-page-tree";
import { toLocale } from "@/lib/i18n";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

export default async function Layout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;
  const locale = toLocale(lang);
  const tree = withGroupLabels(
    withExpandedNewGroups(await withLlmsLinks(source.getPageTree(locale), locale)),
  );
  const { nav, ...base } = await baseOptions(locale);
  return (
    <DocsLayout
      {...base}
      nav={{ ...nav, mode: "top" }}
      slots={{ ...base.slots, header: DocsSiteHeader }}
      tree={tree}
    >
      {children}
    </DocsLayout>
  );
}
