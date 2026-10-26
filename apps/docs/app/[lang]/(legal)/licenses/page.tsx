import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { LegalPage, LegalPageHead } from "@/components/legal-page";
import { type Locale, toLocale } from "@/lib/i18n";
import { licenseGroupId } from "@/lib/license-group-id";
import { licenseTermsUrl } from "@/lib/license-terms";
import { fallbackTexts, LICENSES, textsUsedBy, usageCount } from "@/lib/licenses-manifest";
import { markdownUrl } from "@/lib/markdown-route";
import { onThisPageLabel } from "@/lib/page-toc";
import { localeAlternates } from "@/lib/site";
import { homeOgImagePath, socialMetadata } from "@/lib/social-metadata";
import type {
  LicensedAsset,
  LicensedPackage,
  LicenseGroup,
  LicenseText,
} from "@/lib/third-party-licenses";

export async function generateMetadata(props: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await props.params;
  const locale = toLocale(lang);
  const t = await getTranslations({ locale, namespace: "legal.licenses.meta" });
  const tMeta = await getTranslations({ locale, namespace: "landing.meta" });
  const alternates = localeAlternates(locale, "/licenses");
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: true },
    alternates: { ...alternates, types: { "text/markdown": markdownUrl(alternates.canonical) } },
    ...socialMetadata({
      locale,
      path: alternates.canonical,
      type: "website",
      title: t("title"),
      description: t("description"),
      image: { path: homeOgImagePath(locale), alt: tMeta("ogImageAlt") },
    }),
  };
}

function TextBlock({ text, users }: { text: LicenseText; users: number }): ReactNode {
  return (
    <details id={text.id} className="vk-license-text">
      <summary>
        License text {text.id} ({text.license}, used by {users} {users === 1 ? "entry" : "entries"})
      </summary>
      <pre>{text.text}</pre>
    </details>
  );
}

function OwnerLines({ pkg }: { pkg: LicensedPackage }): ReactNode {
  if (pkg.copyright.length > 0) {
    return pkg.copyright.map((line, index) => <span key={`${index}:${line}`}>{line}</span>);
  }
  if (pkg.author !== null) return <span>Author: {pkg.author}</span>;
  return null;
}

function TextLinks({ ids }: { ids: ReadonlyArray<string> }): ReactNode {
  return ids.map((id, index) => (
    <span key={id}>
      {index > 0 ? ", " : null}
      <a href={`#${id}`}>{id}</a>
    </span>
  ));
}

function MissingText({
  fallback,
  terms,
}: {
  fallback: ReadonlyArray<string>;
  terms: string | null;
}): ReactNode {
  if (fallback.length === 0 && terms !== null) {
    return (
      <span>
        No license file in the package; license terms: <a href={terms}>{terms}</a>
      </span>
    );
  }
  return (
    <span>
      No license file in the package; license text: <TextLinks ids={fallback} />
    </span>
  );
}

function PackageItem({
  pkg,
  fallback,
  terms,
}: {
  pkg: LicensedPackage;
  fallback: ReadonlyArray<string>;
  terms: string | null;
}): ReactNode {
  return (
    <li>
      <code>
        {pkg.name}@{pkg.version}
      </code>
      <OwnerLines pkg={pkg} />
      {pkg.textId === null ? (
        <MissingText fallback={fallback} terms={terms} />
      ) : (
        <span>
          License text: <TextLinks ids={[pkg.textId]} />
        </span>
      )}
      {pkg.notice === null ? null : (
        <details className="vk-license-text">
          <summary>NOTICE</summary>
          <pre>{pkg.notice}</pre>
        </details>
      )}
    </li>
  );
}

const ASSETS_SECTION_ID = "assets";

function JumpNav({ locale }: { locale: Locale }): ReactNode {
  return (
    <nav aria-label={onThisPageLabel(locale)} className="vk-legal-jump">
      <ul lang="en" className="vk-legal-jump-list">
        <li className="vk-legal-jump-item">
          <a className="vk-legal-jump-link" href={`#${ASSETS_SECTION_ID}`}>
            Fonts and other assets
          </a>
        </li>
        {LICENSES.groups.map((group) => (
          <li key={group.license} className="vk-legal-jump-item">
            <a className="vk-legal-jump-link" href={`#${licenseGroupId(group.license)}`}>
              {group.license} <span className="vk-legal-jump-count">{group.packages.length}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function GroupSection({ group }: { group: LicenseGroup }): ReactNode {
  const count = group.packages.length;
  return (
    <section>
      <h2 id={licenseGroupId(group.license)}>
        {group.license} ({count} {count === 1 ? "package" : "packages"})
      </h2>
      <ul className="vk-license-list">
        {group.packages.map((pkg) => (
          <PackageItem
            key={`${pkg.name}@${pkg.version}`}
            pkg={pkg}
            fallback={group.fallbackTextIds}
            terms={licenseTermsUrl(group.license)}
          />
        ))}
      </ul>
      {textsUsedBy(group.packages).map((text) => (
        <TextBlock key={text.id} text={text} users={usageCount(group.packages, text.id)} />
      ))}
      {fallbackTexts(group).map((text) => (
        <TextBlock key={text.id} text={text} users={usageCount(group.packages, null)} />
      ))}
    </section>
  );
}

function AssetItem({ asset }: { asset: LicensedAsset }): ReactNode {
  return (
    <li>
      <strong>{asset.name}</strong>
      <span>License: {asset.license}</span>
      <span>{asset.usage}</span>
      {asset.copyright.map((line, index) => (
        <span key={`${index}:${line}`}>{line}</span>
      ))}
    </li>
  );
}

export default async function LicensesPage(props: { params: Promise<{ lang: string }> }) {
  const { lang } = await props.params;
  const locale = toLocale(lang);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "legal.licenses" });
  const tLegal = await getTranslations({ locale, namespace: "landing.footer.cols.legal" });

  return (
    <LegalPage>
      <LegalPageHead eyebrow={tLegal("title")} title={t("title")} lead={t("intro")} />
      <JumpNav locale={locale} />
      <div lang="en">
        <p>
          {LICENSES.packageCount} packages in {LICENSES.groups.length} license groups, plus{" "}
          {LICENSES.assets.length} assets.
        </p>
        <section>
          <h2 id={ASSETS_SECTION_ID}>Fonts and other assets</h2>
          <ul className="vk-license-list">
            {LICENSES.assets.map((asset) => (
              <AssetItem key={asset.name} asset={asset} />
            ))}
          </ul>
          {textsUsedBy(LICENSES.assets).map((text) => (
            <TextBlock key={text.id} text={text} users={usageCount(LICENSES.assets, text.id)} />
          ))}
        </section>
        {LICENSES.groups.map((group) => (
          <GroupSection key={group.license} group={group} />
        ))}
      </div>
    </LegalPage>
  );
}
