import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { IntentPrefetchLink } from "@/components/ui/intent-prefetch-link";
import {
  type ArtifactBlock,
  type ArtifactLine,
  type ArtifactWords,
  artifactLineText,
  FEATURE_ARTIFACTS,
  type FeatureArtifact,
} from "@/lib/feature-artifacts";
import { localizedPath, toLocale } from "@/lib/i18n";
import { LANDING_FEATURES, type LandingFeatureId } from "@/lib/landing-features";
import { PlainList } from "./plain-list";
import { Section } from "./section";
import { SectionHead } from "./section-head";
import { StudioCardShot } from "./studio-card-shot";

const FEATURES_HEADING_ID = "features-heading";

const DECK_GROUP = "vk-deck";

type Translate = Awaited<ReturnType<typeof getTranslations<"landing.features">>>;

function wordsOf(t: Translate): ArtifactWords {
  return { more: (count) => t("more", { count }), moreChecks: () => t("moreChecks") };
}

function Lines({ lines, t }: { lines: ReadonlyArray<ArtifactLine>; t: Translate }): ReactNode {
  const words = wordsOf(t);
  return (
    <code>
      {lines.map((line, index) => {
        const folded = line.kind === "more" || line.kind === "moreChecks";
        return (
          <span
            key={`${index}-${line.kind}`}
            className="vk-lock-line"
            data-kind={folded ? "gap" : line.kind}
            data-mark={line.kind === "output" && line.hit === true ? "hit" : undefined}
            lang={folded ? undefined : "en"}
          >
            {`${artifactLineText(line, words)}${index < lines.length - 1 ? "\n" : ""}`}
          </span>
        );
      })}
    </code>
  );
}

function Block({
  block,
  label,
  t,
}: {
  block: ArtifactBlock;
  label: string;
  t: Translate;
}): ReactNode {
  if (block.kind === "shot") {
    return (
      <div className="vk-deck-shot-frame">
        <StudioCardShot />
      </div>
    );
  }
  if (block.kind === "sheet") {
    return (
      <table className="vk-deck-sheet" aria-label={label}>
        <thead lang="en">
          <tr>
            {block.columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, index) =>
                cell === "" ? (
                  <td key={block.columns[index]} className="vk-deck-empty">
                    {t("emptyCell")}
                  </td>
                ) : (
                  <td key={block.columns[index]} lang="en">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <pre className="vk-lock-code vk-deck-code">
      <Lines lines={block.lines} t={t} />
    </pre>
  );
}

function Card({
  id,
  artifact,
  t,
}: {
  id: LandingFeatureId;
  artifact: FeatureArtifact;
  t: Translate;
}): ReactNode {
  return (
    <div className="vk-lock-card vk-deck-card">
      <p className="vk-lock-head">
        <span lang="en">{artifact.head}</span>{" "}
        <span className="vk-lock-badge">{t(`badges.${id}`, { count: artifact.count ?? 0 })}</span>
      </p>
      {artifact.blocks.map((block, index) => (
        <Block key={`${index}-${block.kind}`} block={block} label={artifact.head} t={t} />
      ))}
    </div>
  );
}

export async function Features(): Promise<ReactNode> {
  const t = await getTranslations("landing.features");
  const locale = toLocale(await getLocale());
  return (
    <Section id="features" labelledBy={FEATURES_HEADING_ID}>
      <p className="vk-eyebrow">{t("label")}</p>
      <SectionHead id={FEATURES_HEADING_ID} title={t("heading")} lead={t("lead")} align="start" />
      <PlainList ordered className="vk-deck">
        {LANDING_FEATURES.map(({ id, command, docsPath }, index) => {
          const artifact = FEATURE_ARTIFACTS[id];
          const radio = `feature-${id}`;
          return (
            <li key={id} className="vk-deck-item">
              <div className="vk-deck-row">
                <input
                  type="radio"
                  name={DECK_GROUP}
                  id={radio}
                  className="vk-deck-radio"
                  aria-controls={`${radio}-pane`}
                  defaultChecked={index === 0}
                />
                <h3 className="vk-deck-title">
                  <label htmlFor={radio}>{t(`items.${id}.title`)}</label>
                </h3>
                <code className="vk-deck-command" lang="en">
                  {command}
                </code>
              </div>
              <div id={`${radio}-pane`} className="vk-deck-pane">
                <Card id={id} artifact={artifact} t={t} />
                {artifact.result === undefined ? null : (
                  <p className="vk-deck-result" lang="en">
                    {artifact.result}
                  </p>
                )}
                <p className="vk-deck-body">{t(`items.${id}.body`)}</p>
                <IntentPrefetchLink
                  href={localizedPath(locale, docsPath)}
                  className="vk-deck-link"
                  lang="en"
                >
                  {docsPath.slice(1)}
                </IntentPrefetchLink>
              </div>
            </li>
          );
        })}
      </PlainList>
    </Section>
  );
}
