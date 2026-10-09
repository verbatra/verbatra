import { getLocale, getTranslations } from "next-intl/server";
import { Fragment, type ReactNode } from "react";
import { StackIcon, StackIconSprite } from "@/components/stack-icons";
import { TrackedLink } from "@/components/ui/tracked-link";
import {
  FORMAT_SAMPLES,
  type FormatSample,
  sampleLines,
  splitOnPlaceholder,
} from "@/lib/format-samples";
import { type Locale, localizedPath } from "@/lib/i18n";
import { FORMAT_DISPLAY, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { STACK_FRAMEWORKS } from "@/lib/stack-formats";
import { FormatSwitch } from "./format-switch";
import { PlaceholderChip } from "./placeholder-chip";
import { Section } from "./section";
import { SectionHead } from "./section-head";

const ICON_PREFIX = "vk-formats-icon";
const ICON = 16;

function SampleLine({ line, placeholder }: { line: string; placeholder: string }): ReactNode {
  return splitOnPlaceholder(line, placeholder).map((part, index) => (
    <Fragment key={`${index}:${part}`}>
      {part === placeholder ? <PlaceholderChip token={part} /> : part}
    </Fragment>
  ));
}

function SamplePane({ id, sample }: { id: string; sample: FormatSample }): ReactNode {
  const captionId = `formats-file-${id}`;
  return (
    <figure className="vk-formats-file">
      <figcaption id={captionId} className="vk-formats-file-name">
        {sample.file}
      </figcaption>
      <section
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a capped pane scrolls, so the keyboard needs a stop to scroll it
        tabIndex={0}
        aria-labelledby={captionId}
        className="vk-formats-code vk-terminal-scroll"
      >
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
      </section>
    </figure>
  );
}

export async function Formats(): Promise<ReactNode> {
  const t = await getTranslations("landing.formats");
  const locale = (await getLocale()) as Locale;

  return (
    <Section width="wide" rhythm="md" id="formats">
      <SectionHead id="formats-heading" title={t("heading")} lead={t("lead")} reveal />
      <div data-reveal="2" className="vk-formats not-prose">
        <StackIconSprite prefix={ICON_PREFIX} icons={STACK_FRAMEWORKS.map((item) => item.icon)} />
        <FormatSwitch
          labels={{ frameworks: t("frameworksLabel"), formats: t("formatsLabel") }}
          frameworks={STACK_FRAMEWORKS.map(({ key, name, format, icon }) => ({
            key,
            name,
            format,
            icon: (
              <StackIcon
                prefix={ICON_PREFIX}
                icon={icon}
                size={ICON}
                className="vk-formats-chip-icon"
              />
            ),
          }))}
          formats={SUPPORTED_FORMAT_IDS.map((id) => ({
            id,
            label: FORMAT_DISPLAY[id].label,
            pane: <SamplePane id={id} sample={FORMAT_SAMPLES[id]} />,
          }))}
        />
        <p className="vk-formats-more">
          <TrackedLink
            href={localizedPath(locale, "/docs/formats")}
            className="vk-prose-link"
            track={{ name: "click-cta", data: { location: "formats", target: "formats-docs" } }}
          >
            {t("link")}
          </TrackedLink>
        </p>
      </div>
    </Section>
  );
}
