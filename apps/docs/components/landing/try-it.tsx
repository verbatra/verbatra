"use client";

import { useTranslations } from "next-intl";
import { type CSSProperties, type ReactNode, useId, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { SHOWCASE_CLI_COMMAND, showcaseRunLines, showcaseSavings } from "@/lib/showcase-cli";
import type { ShowcaseLine, ShowcaseOutcome, ShowcaseRows } from "@/lib/showcase-scenarios";
import {
  DEFAULT_SHOWCASE_BREAK,
  SHOWCASE_BREAK_REPLIES,
  SHOWCASE_BREAKS,
  SHOWCASE_LOCK_FILE,
  SHOWCASE_PLACEHOLDER,
  SHOWCASE_SCENARIOS,
  SHOWCASE_SOURCE_FILE,
  SHOWCASE_TARGET_FILE,
  type ShowcaseBreakId,
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
        key={`${outcome.scenario ?? "seed"}-${outcome.reply ?? ""}`}
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
  const [pending, setPending] = useState<ShowcaseScenarioId | null>(null);
  const [openPane, setOpenPane] = useState<PaneId>("source");
  const [reply, setReply] = useState<ShowcaseBreakId>(DEFAULT_SHOWCASE_BREAK);
  const breakGroup = useId();
  const latestRequest = useRef(0);
  const firstScenario = useRef<HTMLButtonElement>(null);

  function prefetch() {
    loadScenarioModule().catch(() => undefined);
  }

  async function run(id: ShowcaseScenarioId, retry = false, breakReply = reply) {
    trackUmamiEvent("run-scenario", {
      scenario: id,
      location: "showcase",
      ...(id === "break" ? { break: breakReply } : {}),
      ...(retry ? { retry: true } : {}),
    });
    latestRequest.current += 1;
    const request = latestRequest.current;
    setPending(id);
    try {
      const scenarios = await loadScenarioModule();
      if (request !== latestRequest.current) return;
      setFailedScenario(null);
      setOutcome(scenarios.runShowcaseScenario(id, breakReply));
    } catch {
      if (request === latestRequest.current) setFailedScenario(id);
    } finally {
      if (request === latestRequest.current) setPending(null);
    }
  }

  function reset() {
    trackUmamiEvent("reset-showcase", { location: "showcase" });
    latestRequest.current += 1;
    setPending(null);
    setFailedScenario(null);
    setReply(DEFAULT_SHOWCASE_BREAK);
    setOutcome(seed);
    firstScenario.current?.focus();
  }

  function chooseBreak(next: ShowcaseBreakId) {
    setReply(next);
    run("break", false, next);
  }

  const marks = (line: ShowcaseLine) => (line.mark ? t(`marks.${line.mark}`) : "");
  const broken = brokenTokens(outcome);
  const atSeed = outcome.scenario === null && failedScenario === null && pending === null;

  return (
    <div
      className="vk-showcase-try"
      style={
        { "--showcase-rows-max": Math.max(rows.source, rows.target, rows.lock) } as CSSProperties
      }
    >
      <div className="vk-showcase-bar">
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
        <div className="vk-showcase-actions">
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
      <fieldset className="vk-showcase-breaks" onPointerEnter={prefetch} onFocus={prefetch}>
        <legend className="vk-showcase-breaks-label">{t("breaksLabel")}</legend>
        {SHOWCASE_BREAKS.map((id) => (
          <label key={id} className="vk-showcase-break">
            <input
              type="radio"
              name={breakGroup}
              value={id}
              checked={(outcome.scenario === "break" || pending === "break") && reply === id}
              className="vk-showcase-break-input"
              onChange={() => chooseBreak(id)}
            />
            <span>
              <PlaceholderText
                text={t(`breaks.${id}`, {
                  token: SHOWCASE_BREAK_REPLIES[id].token,
                  placeholder: SHOWCASE_PLACEHOLDER,
                })}
              />
            </span>
          </label>
        ))}
      </fieldset>
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
      <div className="vk-showcase-outcome">
        <OutputPane outcome={outcome} rows={rows.output} broken={broken} />
        <Result outcome={outcome} failed={failedScenario !== null} busy={pending !== null} />
      </div>
    </div>
  );
}
