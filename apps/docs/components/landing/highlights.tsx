import { getLocale, getTranslations } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
import { IntentPrefetchLink } from "@/components/ui/intent-prefetch-link";
import { HERO_CHECK_BADGE } from "@/lib/hero-terminal";
import {
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
import { localizedPath, toLocale } from "@/lib/i18n";
import { MCP_ADD_COMMAND } from "@/lib/install-commands";
import { LOCK_FILE_NAME } from "@/lib/lock-demo";
import { keepCompoundsWhole, keepPackageRunsWhole } from "@/lib/word-breaks";
import { CopyButton } from "./islands";
import { Section } from "./section";
import { SectionHead } from "./section-head";

const HIGHLIGHTS_HEADING_ID = "highlights-heading";

type Translate = Awaited<ReturnType<typeof getTranslations<"landing.highlights">>>;

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
            data-fold={line.collapse === true ? "drop" : undefined}
          >
            <Marked line={line} />
            {index < lines.length - 1 ? "\n" : ""}
          </span>
        ))}
      </code>
    </pre>
  );
}

function Rail({ staleTag }: { staleTag: string }): ReactNode {
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
            <span
              key={key}
              className="vk-lock-line"
              data-mark="stale"
              style={{ "--d": 0 } as CSSProperties}
            >
              <span className="vk-lock-sign" aria-hidden="true">
                ~
              </span>
              <span className="vk-lock-key">{JSON.stringify(key)}</span>
              {": "}
              <span className="vk-lock-value">{JSON.stringify(hash)}</span>
              {comma ? "," : ""}{" "}
              <span className="vk-lock-tag" lang={undefined}>
                {staleTag}
              </span>
              {index < RAIL_ENTRIES.length - 1 ? "\n" : ""}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function StudioRow(): ReactNode {
  return (
    <div className="vk-hl-studio" lang="en">
      <table className="vk-hl-table" aria-label="Locale coverage">
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
    </div>
  );
}

function Pane({
  surface,
  name,
  badge,
  reveal,
  locale,
  children,
  footTop,
  extra,
}: {
  surface: Surface;
  name: string;
  badge: string;
  reveal: number;
  locale: ReturnType<typeof toLocale>;
  children: ReactNode;
  footTop?: ReactNode;
  extra?: ReactNode;
}): ReactNode {
  const titleId = `highlights-${surface}-title`;
  const docsPath = SURFACE_DOCS_PATHS[surface];
  return (
    <article className="vk-hl-pane" data-reveal={reveal} aria-labelledby={titleId}>
      <div className="vk-lock-card">
        <div className="vk-lock-head">
          <h3 id={titleId} className="vk-hl-surface">
            {name}
          </h3>
          <span className="vk-lock-badge">{badge}</span>
        </div>
        {children}
        <div className="vk-lock-foot vk-hl-foot">
          {footTop}
          <div className="vk-hl-actions">
            <IntentPrefetchLink
              href={localizedPath(locale, docsPath)}
              className="vk-deck-link"
              lang="en"
            >
              {docsPath.slice(1)}
            </IntentPrefetchLink>
            {extra}
          </div>
        </div>
      </div>
    </article>
  );
}

function McpSetup({ t }: { t: Translate }): ReactNode {
  return <CopyButton text={MCP_ADD_COMMAND} label={t("mcp.copyAria")} size="sm" />;
}

export async function Highlights(): Promise<ReactNode> {
  const t = await getTranslations("landing.highlights");
  const lockDemo = await getTranslations("landing.lockDemo");
  const locale = toLocale(await getLocale());
  return (
    <Section id="highlights" labelledBy={HIGHLIGHTS_HEADING_ID}>
      <SectionHead
        id={HIGHLIGHTS_HEADING_ID}
        title={t("heading")}
        lead={keepCompoundsWhole(
          t("lead", {
            locale: SURFACE_COUNTS.locale,
            stale: SURFACE_COUNTS.stale,
            upToDate: SURFACE_COUNTS.upToDate,
          }),
        )}
        align="start"
      />
      <div className="vk-hl">
        <Rail staleTag={lockDemo("tags.stale")} />
        <div className="vk-hl-panes">
          <Pane
            surface="cli"
            name={t("surfaces.cli")}
            badge={SURFACE_BADGES.cli}
            reveal={0}
            locale={locale}
          >
            <Lines lines={SURFACE_CODE.cli} />
          </Pane>
          <Pane
            surface="studio"
            name={t("surfaces.studio")}
            badge={SURFACE_BADGES.studio}
            reveal={0}
            locale={locale}
          >
            <StudioRow />
          </Pane>
          <Pane
            surface="sdk"
            name={t("surfaces.sdk")}
            badge={SURFACE_BADGES.sdk}
            reveal={1}
            locale={locale}
          >
            <Lines lines={SURFACE_CODE.sdk} />
          </Pane>
          <Pane
            surface="mcp"
            name={t("surfaces.mcp")}
            badge={t("mcp.badge")}
            reveal={1}
            locale={locale}
            footTop={
              <p className="vk-hl-command" lang="en">
                <code>{keepPackageRunsWhole(MCP_ADD_COMMAND)}</code>
              </p>
            }
            extra={<McpSetup t={t} />}
          >
            <Lines lines={SURFACE_CODE.mcp} />
          </Pane>
        </div>
      </div>
    </Section>
  );
}
