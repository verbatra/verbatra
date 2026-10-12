import type { SupportedFormat } from "@verbatra/sdk";
import { type CSSProperties, Fragment, type ReactNode } from "react";
import { FORMAT_SAMPLES, sampleLines, splitOnPlaceholder } from "@/lib/format-samples";
import { SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { FormatPaneFrame } from "./format-pane-frame";
import { PlaceholderChip } from "./placeholder-chip";

export const FORMAT_PANE_ROWS = 16;

export const FORMAT_PANE_ROWS_STYLE = { "--format-pane-rows": FORMAT_PANE_ROWS } as CSSProperties;

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
  return (
    <FormatPaneFrame id={id} file={FORMAT_SAMPLES[id].file}>
      <SampleCode id={id} />
    </FormatPaneFrame>
  );
}

function shownRows(id: SupportedFormat): number {
  return Math.min(sampleLines(FORMAT_SAMPLES[id]).length, FORMAT_PANE_ROWS);
}

function widestLine(id: SupportedFormat): number {
  return Math.max(...sampleLines(FORMAT_SAMPLES[id]).map((line) => line.length));
}

function byRowsThenWidth(a: SupportedFormat, b: SupportedFormat): number {
  return shownRows(a) - shownRows(b) || widestLine(a) - widestLine(b);
}

export function tallestFormat(): SupportedFormat {
  return SUPPORTED_FORMAT_IDS.reduce((best, id) => (byRowsThenWidth(id, best) > 0 ? id : best));
}

export function longestCaptionFormat(): SupportedFormat {
  return SUPPORTED_FORMAT_IDS.reduce((best, id) =>
    FORMAT_SAMPLES[id].file.length > FORMAT_SAMPLES[best].file.length ? id : best,
  );
}

export function FormatPaneSizer(): ReactNode {
  return (
    <figure className="vk-formats-file">
      <figcaption className="vk-formats-file-name">
        {FORMAT_SAMPLES[longestCaptionFormat()].file}
      </figcaption>
      <div className="vk-formats-code vk-terminal-scroll">
        <SampleCode id={tallestFormat()} />
      </div>
    </figure>
  );
}
