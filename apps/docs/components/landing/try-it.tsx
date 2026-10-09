"use client";

import { useTranslations } from "next-intl";
import { type CSSProperties, type ReactNode, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import type { ShowcaseLine, ShowcaseOutcome, ShowcaseRows } from "@/lib/showcase-scenarios";
import {
  SHOWCASE_LOCK_FILE,
  SHOWCASE_SCENARIOS,
  SHOWCASE_SOURCE_FILE,
  SHOWCASE_TARGET_FILE,
  type ShowcaseScenarioId,
} from "@/lib/showcase-seed";
import { trackUmamiEvent } from "@/lib/umami";
import { WrapTokens } from "./wrap-text";

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
}: {
  id: PaneId;
  file: string;
  lines: ReadonlyArray<ShowcaseLine>;
  rows: number;
  open: boolean;
  marks: (line: ShowcaseLine) => string;
}): ReactNode {
  return (
    <figure className="vk-showcase-file" data-pane={id} data-open={open}>
      <figcaption className="vk-showcase-file-name">{file}</figcaption>
      <pre className="vk-showcase-code" style={{ "--showcase-rows": rows } as CSSProperties}>
        {lines.map((line, index) => (
          <span key={`${index}-${line.text}`} className="vk-showcase-line" data-mark={line.mark}>
            <code className="vk-showcase-line-text">{line.text}</code>
            {line.mark ? <span className="vk-showcase-mark">{marks(line)}</span> : null}
          </span>
        ))}
      </pre>
    </figure>
  );
}

function keyList(keys: ReadonlyArray<string>): string {
  return keys.join(", ");
}

function Result({ outcome, failed }: { outcome: ShowcaseOutcome; failed: boolean }): ReactNode {
  const t = useTranslations("landing.showcase.tryIt.result");
  const sent = [...outcome.missing, ...outcome.stale];
  const sendValue =
    sent.length === 0
      ? t("nothing")
      : keyList([
          ...outcome.missing.map((key) => t("missingKey", { key })),
          ...outcome.stale.map((key) => t("staleKey", { key })),
        ]);
  const skipValue = [
    t("unchanged", { count: outcome.unchanged.length }),
    ...outcome.orphaned.map((key) => t("orphanedKey", { key })),
  ].join("; ");
  const lockValue =
    outcome.written.length === 0
      ? t("lockNone")
      : t("lockChanges", { count: outcome.written.length, keys: keyList(outcome.written) });
  const refusal = outcome.refusal;
  const gateValue = refusal
    ? t("gateRefused", {
        key: refusal.key,
        candidate: refusal.candidate,
        details: refusal.details.join(" "),
      })
    : t(sent.length === 0 ? "gateIdle" : "gatePass");

  const title = failed
    ? t("failed")
    : outcome.scenario === null
      ? t("seed")
      : t("headline", { count: sent.length });

  const rows = [
    ["send", sendValue],
    ["skip", skipValue],
    ["lock", lockValue],
    ["gate", gateValue],
  ] as const;

  return (
    <div className="vk-showcase-result" role="status" aria-live="polite" aria-atomic="true">
      <p className="vk-showcase-result-title" data-failed={failed ? "" : undefined}>
        {title}
      </p>
      <dl className="vk-showcase-result-rows">
        {rows.map(([id, value]) => (
          <div key={id} className="contents">
            <dt>{t(`rows.${id}`)}</dt>
            <dd data-refused={id === "gate" && refusal !== null ? "" : undefined}>
              <WrapTokens text={value} />
            </dd>
          </div>
        ))}
      </dl>
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

  async function run(id: ShowcaseScenarioId) {
    trackUmamiEvent("showcase-scenario", { scenario: id });
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
    latestRequest.current += 1;
    setPending(false);
    setFailedScenario(null);
    setOutcome(seed);
    firstScenario.current?.focus();
  }

  const marks = (line: ShowcaseLine) => (line.mark ? t(`marks.${line.mark}`) : "");
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
          />
        ))}
      </div>
      <div className="vk-showcase-outcome">
        <Result outcome={outcome} failed={failedScenario !== null} />
        <div className="vk-showcase-outcome-actions">
          {failedScenario === null ? null : (
            <button
              type="button"
              className={buttonClasses("secondary", "sm", "vk-showcase-retry")}
              onClick={() => run(failedScenario)}
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
  );
}
