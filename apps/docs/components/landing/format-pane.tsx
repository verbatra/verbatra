import type { SupportedFormat } from "@verbatra/sdk";
import { Fragment, type ReactNode } from "react";
import { FORMAT_SAMPLES, sampleLines, splitOnPlaceholder } from "@/lib/format-samples";
import { SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { PlaceholderChip } from "./placeholder-chip";

export const FORMAT_PANE_ROWS = 16;

export function SampleLine({
  line,
  placeholder,
}: {
  line: string;
  placeholder: string;
}): ReactNode {
  return splitOnPlaceholder(line, placeholder).map((part, index) => (
    <Fragment key={`${index}:${part}`}>
      {part === placeholder ? <PlaceholderChip token={part} /> : part}
    </Fragment>
  ));
}

function SampleCode({ id }: { id: SupportedFormat }): ReactNode {
  const sample = FORMAT_SAMPLES[id];
  return (
    <pre className="vk-formats-code-text">
      <code>
        {sampleLines(sample).map((line, index) => (
          <Fragment key={`${index}:${line}`}>
            {index > 0 ? "\n" : null}
            <SampleLine line={line} placeholder={sample.placeholder} />
          </Fragment>
        ))}
      </code>
    </pre>
  );
}

export function FormatPane({ id }: { id: SupportedFormat }): ReactNode {
  const captionId = `formats-file-${id}`;
  return (
    <figure className="vk-formats-file">
      <figcaption id={captionId} className="vk-formats-file-name">
        {FORMAT_SAMPLES[id].file}
      </figcaption>
      <section
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a capped pane scrolls, so the keyboard needs a stop to scroll it
        tabIndex={0}
        aria-labelledby={captionId}
        className="vk-formats-code vk-terminal-scroll"
      >
        <SampleCode id={id} />
      </section>
    </figure>
  );
}

function shownRows(id: SupportedFormat): number {
  return Math.min(sampleLines(FORMAT_SAMPLES[id]).length, FORMAT_PANE_ROWS);
}

function widestLine(id: SupportedFormat): number {
  return Math.max(...sampleLines(FORMAT_SAMPLES[id]).map((line) => line.length));
}

export function tallestFormat(): SupportedFormat {
  return [...SUPPORTED_FORMAT_IDS].sort(
    (a, b) => shownRows(b) - shownRows(a) || widestLine(b) - widestLine(a),
  )[0] as SupportedFormat;
}

export function FormatPaneSizer(): ReactNode {
  const id = tallestFormat();
  return (
    <figure className="vk-formats-file">
      <figcaption className="vk-formats-file-name">{FORMAT_SAMPLES[id].file}</figcaption>
      <div className="vk-formats-code vk-terminal-scroll">
        <SampleCode id={id} />
      </div>
    </figure>
  );
}
