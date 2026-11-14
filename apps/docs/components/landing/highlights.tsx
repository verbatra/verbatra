import { getLocale, getTranslations } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
import { IntentPrefetchLink } from "@/components/ui/intent-prefetch-link";
import { HERO_CHECK_BADGE } from "@/lib/hero-terminal";
import {
  LOCK_STATE_STALE,
  RAIL_ENTRIES,
  STUDIO_COLUMNS,
  STUDIO_ROW,
  SURFACE_BADGES,
  SURFACE_CODE,
  SURFACE_COUNTS,
  SURFACE_DOCS_PATHS,
  type Surface,
  type SurfaceLine,
} from "@/lib/highlights-surfaces";
import { type Locale, localizedPath, toLocale } from "@/lib/i18n";
import { MCP_ADD_COMMAND, SDK_INSTALL_COMMAND } from "@/lib/install-commands";
import { LOCK_FILE_NAME } from "@/lib/lock-demo";
import { keepCompoundsWhole, keepPackageRunsWhole } from "@/lib/word-breaks";
import { CopyButton } from "./islands";
import { Section } from "./section";
import { SectionHead } from "./section-head";

const HIGHLIGHTS_HEADING_ID = "highlights-heading";

function Marked({ line }: { line: SurfaceLine }): ReactNode {
  if (line.hit === undefined) return keepCompoundsWhole(line.text);
  const at = line.text.indexOf(line.hit);
  return (
    <>
      {keepCompoundsWhole(line.text.slice(0, at))}
      <span className="vk-hl-stale">{line.hit}</span>
      {keepCompoundsWhole(line.text.slice(at + line.hit.length))}
    </>
  );
}

function Lines({ lines }: { lines: ReadonlyArray<SurfaceLine> }): ReactNode {
  return (
    <pre className="vk-lock-code vk-deck-code" lang="en">
      <code>
        {lines.map((line, index) => (
          <span
            key={`${index}-${line.text}`}
            className="vk-lock-line"
            data-kind={line.command === true ? "command" : undefined}
            data-mark={line.hit === undefined ? undefined : "hit"}
            data-fold={line.collapse === "phone" ? "drop" : line.collapse}
          >
            <Marked line={line} />
            {index < lines.length - 1 ? "\n" : ""}
          </span>
        ))}
      </code>
    </pre>
  );
}

function Rail(): ReactNode {
  return (
    <div className="vk-lock-card vk-hl-rail">
      <p className="vk-lock-head">
        <span lang="en">{LOCK_FILE_NAME}</span>{" "}
        <span className="vk-lock-badge" lang="en">
          {keepCompoundsWhole(HERO_CHECK_BADGE)}
        </span>
      </p>
      <pre className="vk-lock-code" lang="en">
        <code>
          {RAIL_ENTRIES.map(({ key, hash, comma }, index) => (
            <span key={key} className="vk-lock-line" data-mark="stale">
              <span className="vk-lock-sign" aria-hidden="true">
                ~
              </span>
              <span className="vk-lock-key">{JSON.stringify(key)}</span>
              {": "}
              <span className="vk-lock-value">{JSON.stringify(hash)}</span>
              {comma ? "," : ""}{" "}
              <span className="vk-lock-tag" lang="en">
                {LOCK_STATE_STALE}
              </span>
              {index < RAIL_ENTRIES.length - 1 ? "\n" : ""}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function StudioRow({ label }: { label: string }): ReactNode {
  return (
    <figure className="vk-hl-studio">
      <figcaption className="sr-only">{label}</figcaption>
      <table className="vk-hl-table" lang="en">
        <thead>
          <tr>
            {STUDIO_COLUMNS.map((column, index) => (
              <th
                key={column}
                scope="col"
                className={index > 1 ? "vk-hl-head vk-hl-num" : "vk-hl-head"}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="vk-hl-cell vk-hl-locale">{STUDIO_ROW.locale}</td>
            <td className="vk-hl-cell">
              <span className="vk-hl-coverage">
                <span className="vk-hl-figures">
                  <b className="vk-hl-percent">{STUDIO_ROW.percent}%</b>{" "}
                  <span className="vk-hl-keys">{STUDIO_ROW.keys}</span>
                </span>
                <span className="vk-hl-bar" aria-hidden="true">
                  <i style={{ "--vk-hl-fill": STUDIO_ROW.percent / 100 } as CSSProperties} />
                </span>
              </span>
            </td>
            <td className="vk-hl-cell vk-hl-num">{STUDIO_ROW.missing}</td>
            <td className="vk-hl-cell vk-hl-num">
              <span className="vk-hl-stale">{STUDIO_ROW.stale}</span>
            </td>
            <td className="vk-hl-cell vk-hl-num">{STUDIO_ROW.upToDate}</td>
          </tr>
        </tbody>
      </table>
    </figure>
  );
}

function Pane({
  surface,
  name,
  badge,
  badgeLang,
  reveal,
  locale,
  children,
  command,
  copy,
}: {
  surface: Surface;
  name: string;
  badge: string;
  badgeLang?: "en";
  reveal: number;
  locale: Locale;
  children: ReactNode;
  command?: ReactNode;
  copy?: ReactNode;
}): ReactNode {
  const titleId = `highlights-${surface}-title`;
  const docsPath = SURFACE_DOCS_PATHS[surface];
  return (
    <article
      className="vk-hl-pane"
      data-surface={surface}
      data-reveal={reveal}
      aria-labelledby={titleId}
    >
      <div className="vk-lock-card">
        <div className="vk-lock-head">
          <h3 id={titleId} className="vk-hl-surface">
            {name}
          </h3>
          <span className="vk-lock-badge" lang={badgeLang}>
            {badge}
          </span>
        </div>
        {children}
        <div className="vk-lock-foot vk-hl-foot">
          {command}
          <div className="vk-hl-actions">
            <IntentPrefetchLink
              href={localizedPath(locale, docsPath)}
              className="vk-deck-link"
              lang="en"
            >
              {docsPath.slice(1)}
            </IntentPrefetchLink>
            {copy}
          </div>
        </div>
      </div>
    </article>
  );
}

export async function Highlights(): Promise<ReactNode> {
  const t = await getTranslations("landing.highlights");
  const locale = toLocale(await getLocale());
  return (
    <Section id="highlights" labelledBy={HIGHLIGHTS_HEADING_ID}>
      <SectionHead
        id={HIGHLIGHTS_HEADING_ID}
        title={t("heading")}
        lead={keepCompoundsWhole(
          t("lead", { stale: SURFACE_COUNTS.stale, upToDate: SURFACE_COUNTS.upToDate }),
        )}
        align="start"
      />
      <div className="vk-hl">
        <Rail />
        <div className="vk-hl-panes">
          <Pane
            surface="cli"
            name={t("surfaces.cli")}
            badge={SURFACE_BADGES.cli}
            badgeLang="en"
            reveal={0}
            locale={locale}
          >
            <Lines lines={SURFACE_CODE.cli} />
          </Pane>
          <Pane
            surface="studio"
            name={t("surfaces.studio")}
            badge={SURFACE_BADGES.studio}
            badgeLang="en"
            reveal={0}
            locale={locale}
          >
            <StudioRow label={t("studio.label")} />
          </Pane>
          <Pane
            surface="sdk"
            name={t("surfaces.sdk")}
            badge={SURFACE_BADGES.sdk}
            badgeLang="en"
            reveal={1}
            locale={locale}
            command={
              <p className="vk-hl-command" lang="en">
                <code>{keepPackageRunsWhole(SDK_INSTALL_COMMAND)}</code>
              </p>
            }
            copy={<CopyButton text={SDK_INSTALL_COMMAND} label={t("sdk.copyAria")} size="sm" />}
          >
            <Lines lines={SURFACE_CODE.sdk} />
          </Pane>
          <Pane
            surface="mcp"
            name={t("surfaces.mcp")}
            badge={t("mcp.badge")}
            reveal={1}
            locale={locale}
            command={
              <p className="vk-hl-command" lang="en">
                <code>{keepPackageRunsWhole(MCP_ADD_COMMAND)}</code>
              </p>
            }
            copy={<CopyButton text={MCP_ADD_COMMAND} label={t("mcp.copyAria")} size="sm" />}
          >
            <Lines lines={SURFACE_CODE.mcp} />
          </Pane>
        </div>
      </div>
    </Section>
  );
}
