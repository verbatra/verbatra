import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { toLocale } from "@/lib/i18n";
import manifest from "@/lib/licenses.generated.json";
import { localeAlternates } from "@/lib/site";
import { homeOgImagePath, socialMetadata } from "@/lib/social-metadata";
import {
  type LicensedAsset,
  type LicensedPackage,
  type LicenseGroup,
  type LicenseText,
  licenseTermsUrl,
  type ThirdPartyLicenses,
} from "@/lib/third-party-licenses";

const LICENSES: ThirdPartyLicenses = manifest;
const TEXTS = new Map(LICENSES.texts.map((text) => [text.id, text]));
const OWN_TEXT_IDS = new Set(
  [...LICENSES.assets, ...LICENSES.groups.flatMap((group) => group.packages)].map(
    (entry) => entry.textId,
  ),
);
const FALLBACK_HOME = new Map<string, string>();
for (const group of LICENSES.groups) {
  for (const id of group.fallbackTextIds) {
    if (!OWN_TEXT_IDS.has(id) && !FALLBACK_HOME.has(id)) FALLBACK_HOME.set(id, group.license);
  }
}

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
    alternates,
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

function textsUsedBy(entries: ReadonlyArray<{ textId: string | null }>): LicenseText[] {
  const ids = [...new Set(entries.map((entry) => entry.textId))];
  return ids.flatMap((id) => {
    const text = id === null ? undefined : TEXTS.get(id);
    return text === undefined ? [] : [text];
  });
}

function fallbackTexts(group: LicenseGroup): LicenseText[] {
  return group.fallbackTextIds.flatMap((id) => {
    const text = FALLBACK_HOME.get(id) === group.license ? TEXTS.get(id) : undefined;
    return text === undefined ? [] : [text];
  });
}

function usageCount(entries: ReadonlyArray<{ textId: string | null }>, id: string | null): number {
  return entries.filter((entry) => entry.textId === id).length;
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

function GroupSection({ group }: { group: LicenseGroup }): ReactNode {
  const count = group.packages.length;
  return (
    <section>
      <h2>
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

  return (
    <article className="container mx-auto max-w-3xl px-6 py-16 prose">
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>
      <div lang="en">
        <p>
          {LICENSES.packageCount} packages in {LICENSES.groups.length} license groups, plus{" "}
          {LICENSES.assets.length} assets.
        </p>
        <section>
          <h2>Fonts and other assets</h2>
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
    </article>
  );
}
