import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import {
  PROBLEM_CHECK_LINES,
  PROBLEM_ITEM_KEYS,
  PROBLEM_SOURCE_FILE,
  PROBLEM_TARGET_FILE,
  type ProblemFile,
} from "@/lib/landing-problem";
import { PlaceholderText } from "./placeholder-chip";
import { Section } from "./section";
import { SectionHead } from "./section-head";

const MISSING_LINE_CLASS =
  "border-s-2 border-(--v-status-new) bg-[color-mix(in_srgb,var(--v-status-new)_12%,transparent)] ps-[calc(1rem-2px)]";

function FilePane({ file, missingLabel }: { file: ProblemFile; missingLabel: string }): ReactNode {
  return (
    <figure className="m-0 min-w-0" data-file={file.path}>
      <figcaption className="border-b border-fd-border px-4 py-2 font-mono text-xs text-(--text-muted)">
        {file.path}
      </figcaption>
      <div className="vk-mono-sm overflow-x-auto py-3 font-mono leading-6 text-(--text-body)">
        {file.lines.map((line, index) =>
          line.missing ? (
            <div
              key={`missing-${line.missing}`}
              data-missing={line.missing}
              className={`flex flex-wrap items-baseline gap-x-3 ${MISSING_LINE_CLASS}`}
            >
              <span className="text-(--v-status-new)">{missingLabel}</span>
              <span className="text-(--text-strong)">{line.missing}</span>
            </div>
          ) : (
            <div key={`${index}-${line.text}`} className="px-4 whitespace-pre">
              <PlaceholderText text={line.text} />
            </div>
          ),
        )}
      </div>
    </figure>
  );
}

function CheckOutput(): ReactNode {
  const [command, ...output] = PROBLEM_CHECK_LINES;
  return (
    <div
      lang="en"
      data-check-output
      className="vk-mono-sm overflow-x-auto border-t border-fd-border px-4 py-3 font-mono leading-6"
    >
      <div className="whitespace-pre text-(--text-strong)">
        <span aria-hidden="true" className="text-(--accent)">
          {"$ "}
        </span>
        {command}
      </div>
      {output.map((line) => (
        <div key={line} className="whitespace-pre text-(--text-muted)">
          {line}
        </div>
      ))}
    </div>
  );
}

export async function Problem(): Promise<ReactNode> {
  const t = await getTranslations("landing.problem");
  const marks = await getTranslations("landing.showcase.tryIt.marks");
  const missingLabel = marks("missing");
  return (
    <Section id="problem">
      <SectionHead id="problem-heading" title={t("heading")} lead={t("lead")} reveal />
      <div className="mt-10 grid gap-10 lg:mt-14 lg:grid-cols-12 lg:gap-6">
        <div
          data-reveal="2"
          className="min-w-0 overflow-hidden rounded-xl border border-fd-border bg-(--v-void) lg:col-span-7"
        >
          <div className="grid divide-y divide-fd-border md:grid-cols-2 md:divide-x md:divide-y-0">
            <FilePane file={PROBLEM_SOURCE_FILE} missingLabel={missingLabel} />
            <FilePane file={PROBLEM_TARGET_FILE} missingLabel={missingLabel} />
          </div>
          <CheckOutput />
        </div>
        <ul
          // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from a list-style: none list
          role="list"
          data-reveal="3"
          className="grid list-none content-start gap-8 lg:col-span-4 lg:col-start-9"
        >
          {PROBLEM_ITEM_KEYS.map((key) => (
            <li key={key} className="grid gap-2 border-t border-fd-border pt-5">
              <h3 className="text-base font-semibold text-(--text-strong)">
                {t(`items.${key}.title`)}
              </h3>
              <p className="max-w-[46ch] text-sm leading-relaxed text-(--text-muted)">
                {t(`items.${key}.body`)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
