import { DocsLayout } from "fumadocs-ui/layouts/notebook";
import type { ReactNode } from "react";
import { LegalFooter } from "@/components/legal-footer";
import { RootTabsProvider, SidebarTabs } from "@/components/root-tabs";
import { DocsSiteHeader } from "@/components/site-header";
import { withGroupLabels } from "@/lib/docs-group-labels";
import { withLlmsLinks, withShortCommandLabels } from "@/lib/docs-page-tree";
import { withStatusBadges } from "@/lib/docs-status-badges";
import { toLocale } from "@/lib/i18n";
import { baseOptions } from "@/lib/layout.shared";
import { rootTabs, withNavOnlyTabLinks } from "@/lib/root-tabs";
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
    await withStatusBadges(
      withShortCommandLabels(await withLlmsLinks(source.getPageTree(locale), locale)),
      locale,
    ),
  );
  const { nav, links = [], ...base } = await baseOptions(locale);
  const tabs = rootTabs(tree);
  return (
    <RootTabsProvider tabs={tabs}>
      <DocsLayout
        {...base}
        links={withNavOnlyTabLinks(links, tabs)}
        nav={{ ...nav, mode: "top" }}
        slots={{ ...base.slots, header: DocsSiteHeader }}
        sidebar={{ banner: <SidebarTabs key="root-tabs" /> }}
        tabs={false}
        tree={tree}
      >
        {children}
        <LegalFooter locale={locale} />
      </DocsLayout>
    </RootTabsProvider>
  );
}
