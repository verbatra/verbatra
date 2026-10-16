import type { CSSProperties, ReactNode } from "react";
import { HeroDiffMotion } from "@/components/landing/islands";
import { PlaceholderText } from "@/components/landing/placeholder-chip";
import { ScrollBlock } from "@/components/landing/scroll-block";
import {
  HERO_DIFF_SOURCE_PANE,
  HERO_DIFF_TARGET_PANE,
  type HeroDiffLine,
  type HeroDiffPane,
} from "@/lib/hero-diff";

export type HeroDiffMarks = { readonly missing: string; readonly filled: string };

function DiffLine({
  line,
  index,
  marks,
}: {
  line: HeroDiffLine;
  index: number;
  marks: HeroDiffMarks;
}): ReactNode {
  if (line.fill === undefined) {
    return (
      <span className="vk-showcase-line">
        <code className="vk-showcase-line-text">
          <PlaceholderText text={line.text} />
        </code>
      </span>
    );
  }
  return (
    <span
      className="vk-showcase-line vk-hero-diff-line"
      data-mark="new"
      data-fill={line.fill.key}
      style={{ "--fill-index": index } as CSSProperties}
    >
      <code className="vk-showcase-line-text">
        {line.fill.lead}
        <span className="vk-hero-diff-value">
          <PlaceholderText text={line.fill.value} />
        </span>
      </code>
      <span className="vk-showcase-mark vk-hero-diff-mark">
        <span className="vk-hero-diff-mark-missing" aria-hidden="true">
          {marks.missing}
        </span>
        <span className="vk-hero-diff-mark-filled">{marks.filled}</span>
      </span>
    </span>
  );
}

function DiffPane({
  pane,
  id,
  marks,
}: {
  pane: HeroDiffPane;
  id: string;
  marks: HeroDiffMarks;
}): ReactNode {
  const fillOrder = new Map(
    pane.lines.filter((line) => line.fill !== undefined).map((line, order) => [line, order]),
  );
  return (
    <figure className="vk-hero-diff-pane">
      <figcaption id={id} className="vk-hero-diff-file">
        {pane.file}
      </figcaption>
      <ScrollBlock labelledBy={id} lang="en" className="vk-hero-diff-scroll">
        <pre className="vk-hero-diff-code">
          {pane.lines.map((line, index) => (
            <DiffLine
              key={`${index}:${line.text}`}
              line={line}
              index={fillOrder.get(line) ?? 0}
              marks={marks}
            />
          ))}
        </pre>
      </ScrollBlock>
    </figure>
  );
}

export function HeroDiff({ label, marks }: { label: string; marks: HeroDiffMarks }): ReactNode {
  return (
    <figure className="vk-hero-diff" aria-label={label}>
      <HeroDiffMotion>
        <div className="vk-hero-diff-panes">
          <DiffPane pane={HERO_DIFF_SOURCE_PANE} id="hero-diff-source" marks={marks} />
          <DiffPane pane={HERO_DIFF_TARGET_PANE} id="hero-diff-target" marks={marks} />
        </div>
      </HeroDiffMotion>
    </figure>
  );
}
