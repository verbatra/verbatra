"use client";

import { useTranslations } from "next-intl";
import { type CSSProperties, type ReactNode, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { SHOWCASE_CLI_COMMAND, showcaseRunLines, showcaseSavings } from "@/lib/showcase-cli";
import type { ShowcaseLine, ShowcaseOutcome, ShowcaseRows } from "@/lib/showcase-scenarios";
import {
  SHOWCASE_LOCK_FILE,
  SHOWCASE_SCENARIOS,
  SHOWCASE_SOURCE_FILE,
  SHOWCASE_TARGET_FILE,
  type ShowcaseScenarioId,
} from "@/lib/showcase-seed";
import { trackUmamiEvent } from "@/lib/umami";
import { PlaceholderText } from "./placeholder-chip";

type ScenarioModule = typeof import("@/lib/showcase-scenarios");

let scenarioModule: Promise<ScenarioModule> | undefined;

function loadScenarioModule(): Promise<ScenarioModule> {
  scenarioModule ??= import("@/lib/showcase-scenarios").catch((error: unknown) => {
    scenarioModule = undefined;
    throw error;
  });
  return scenarioModule;
}

const PANES = [
  { id: "source", file: SHOWCASE_SOURCE_FILE },
  { id: "target", file: SHOWCASE_TARGET_FILE },
  { id: "lock", file: SHOWCASE_LOCK_FILE },
] as const;

type PaneId = (typeof PANES)[number]["id"];

function FilePane({
  id,
  file,
  lines,
  rows,
  open,
  marks,
  broken,
}: {
  id: PaneId;
  file: string;
  lines: ReadonlyArray<ShowcaseLine>;
  rows: number;
  open: boolean;
  marks: (line: ShowcaseLine) => string;
  broken: ReadonlySet<string>;
}): ReactNode {
  return (
    <figure className="vk-showcase-file" data-pane={id} data-open={open}>
      <figcaption className="vk-showcase-file-name">{file}</figcaption>
      <pre className="vk-showcase-code" style={{ "--showcase-rows": rows } as CSSProperties}>
        {lines.map((line, index) => (
          <span key={`${index}-${line.text}`} className="vk-showcase-line" data-mark={line.mark}>
            <code className="vk-showcase-line-text">
              <PlaceholderText text={line.text} broken={broken} />
            </code>
            {line.mark ? <span className="vk-showcase-mark">{marks(line)}</span> : null}
          </span>
        ))}
      </pre>
    </figure>
  );
}

function brokenTokens(outcome: ShowcaseOutcome): ReadonlySet<string> {
  const details = outcome.refusal?.details ?? [];
  return new Set(
    details.filter((detail) => detail.startsWith("+")).map((detail) => detail.slice(1)),
  );
}

function OutputPane({
  outcome,
  rows,
  broken,
}: {
  outcome: ShowcaseOutcome;
  rows: number;
  broken: ReadonlySet<string>;
}): ReactNode {
  const t = useTranslations("landing.showcase.tryIt.result");
  return (
    <figure className="vk-showcase-output" aria-label={t("outputLabel")} lang="en">
      <figcaption className="vk-showcase-output-name">{SHOWCASE_CLI_COMMAND}</figcaption>
      <pre
        key={outcome.scenario ?? "seed"}
        className="vk-showcase-output-code"
        data-printing={outcome.scenario === null ? undefined : ""}
        style={{ "--showcase-output-rows": rows } as CSSProperties}
      >
        {showcaseRunLines(outcome).map((line, index) => (
          <span
            key={`${index}-${line}`}
            className="vk-showcase-output-line"
            style={{ "--line-index": index } as CSSProperties}
          >
            <PlaceholderText text={line} broken={broken} />
          </span>
        ))}
      </pre>
    </figure>
  );
}

function Result({
  outcome,
  failed,
  busy,
}: {
  outcome: ShowcaseOutcome;
  failed: boolean;
  busy: boolean;
}): ReactNode {
  const t = useTranslations("landing.showcase.tryIt.result");
  const savings = showcaseSavings(outcome);
  const sentence = failed
    ? t("failed")
    : outcome.scenario === null
      ? t("seed")
      : t("summary", {
          written: outcome.written.length,
          withheld: outcome.refusal === null ? "no" : "yes",
          orphaned: outcome.orphaned.length === 0 ? "no" : "yes",
        });

  return (
    <div className="vk-showcase-summary">
      <p className="vk-showcase-savings">{t("savings", savings)}</p>
      <div
        className="vk-showcase-result"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-busy={busy || undefined}
      >
        <p className="vk-showcase-result-title" data-failed={failed ? "" : undefined}>
          {sentence}
        </p>
      </div>
    </div>
  );
}

export function TryIt({ seed, rows }: { seed: ShowcaseOutcome; rows: ShowcaseRows }): ReactNode {
  const t = useTranslations("landing.showcase.tryIt");
  const [outcome, setOutcome] = useState<ShowcaseOutcome>(seed);
  const [failedScenario, setFailedScenario] = useState<ShowcaseScenarioId | null>(null);
  const [pending, setPending] = useState(false);
  const [openPane, setOpenPane] = useState<PaneId>("source");
  const latestRequest = useRef(0);
  const firstScenario = useRef<HTMLButtonElement>(null);

  function prefetch() {
    loadScenarioModule().catch(() => undefined);
  }

  async function run(id: ShowcaseScenarioId, retry = false) {
    trackUmamiEvent("run-scenario", {
      scenario: id,
      location: "showcase",
      ...(retry ? { retry: true } : {}),
    });
    latestRequest.current += 1;
    const request = latestRequest.current;
    setPending(true);
    try {
      const scenarios = await loadScenarioModule();
      if (request !== latestRequest.current) return;
      setFailedScenario(null);
      setOutcome(scenarios.runShowcaseScenario(id));
    } catch {
      if (request === latestRequest.current) setFailedScenario(id);
    } finally {
      if (request === latestRequest.current) setPending(false);
    }
  }

  function reset() {
    trackUmamiEvent("reset-showcase", { location: "showcase" });
    latestRequest.current += 1;
    setPending(false);
    setFailedScenario(null);
    setOutcome(seed);
    firstScenario.current?.focus();
  }

  const marks = (line: ShowcaseLine) => (line.mark ? t(`marks.${line.mark}`) : "");
  const broken = brokenTokens(outcome);
  const atSeed = outcome.scenario === null && failedScenario === null && !pending;

  return (
    <div className="vk-showcase-try">
      <div className="vk-showcase-controls">
        <fieldset className="vk-showcase-scenarios" onPointerEnter={prefetch} onFocus={prefetch}>
          <legend className="sr-only">{t("scenariosLabel")}</legend>
          {SHOWCASE_SCENARIOS.map((id, index) => (
            <button
              key={id}
              ref={index === 0 ? firstScenario : undefined}
              type="button"
              aria-pressed={failedScenario === null && outcome.scenario === id}
              className={buttonClasses("secondary", "sm", "vk-showcase-scenario")}
              onClick={() => run(id)}
            >
              {t(`scenarios.${id}`)}
            </button>
          ))}
        </fieldset>
      </div>
      <fieldset className="vk-showcase-file-switch">
        <legend className="sr-only">{t("filesLabel")}</legend>
        {PANES.map((pane) => (
          <button
            key={pane.id}
            type="button"
            aria-pressed={openPane === pane.id}
            className="vk-showcase-file-tab"
            onClick={() => setOpenPane(pane.id)}
          >
            {pane.file}
          </button>
        ))}
      </fieldset>
      <div
        className="vk-showcase-files"
        style={
          { "--showcase-rows-max": Math.max(rows.source, rows.target, rows.lock) } as CSSProperties
        }
      >
        {PANES.map((pane) => (
          <FilePane
            key={pane.id}
            id={pane.id}
            file={pane.file}
            lines={outcome[pane.id]}
            rows={rows[pane.id]}
            open={openPane === pane.id}
            marks={marks}
            broken={broken}
          />
        ))}
      </div>
      <div className="vk-showcase-outcome">
        <OutputPane outcome={outcome} rows={rows.output} broken={broken} />
        <div className="vk-showcase-outcome-footer">
          <Result outcome={outcome} failed={failedScenario !== null} busy={pending} />
          <div className="vk-showcase-outcome-actions">
            {failedScenario === null ? null : (
              <button
                type="button"
                className={buttonClasses("secondary", "sm", "vk-showcase-retry")}
                onClick={() => run(failedScenario, true)}
              >
                {t("retry")}
              </button>
            )}
            <button
              type="button"
              className={buttonClasses("ghost", "sm", "vk-showcase-reset")}
              hidden={atSeed}
              onClick={reset}
            >
              {t("reset")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
