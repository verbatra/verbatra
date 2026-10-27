"use client";

import { type CSSProperties, type ReactNode, useEffect, useReducer, useRef, useState } from "react";
import { CopyControl, type CopyControlStatusLabels } from "@/components/ui/copy-control";
import type { PlaygroundItem, PlaygroundTranslations } from "@/lib/landing-playground";
import {
  type CycleAction,
  type CycleState,
  cycleReducer,
  cycleRunning,
  decodeSegments,
  type Frame,
  frameAt,
  initialCycle,
  intactPlaceholders,
  type PlaygroundPhase,
  SCRAMBLE_TICK_MS,
  type Segment,
  sceneEnd,
  scramblePool,
  splitPlaceholders,
  TICK_MS,
} from "@/lib/playground-cycle";
import {
  type PlaygroundSnippetConfig,
  playgroundSnippet,
  snippetHotVar,
} from "@/lib/playground-snippet";
import { prefersReducedMotion, subscribeReducedMotion } from "@/lib/reduced-motion";
import { CodeFrameShell } from "./code-frame-shell";

export type PlaygroundLanguage = { readonly code: string; readonly name: string };

export type PlaygroundLabels = {
  readonly items: string;
  readonly languages: string;
  readonly source: string;
  readonly copy: string;
  readonly copyStatus: CopyControlStatusLabels;
  readonly pause: string;
  readonly play: string;
  readonly running: string;
  readonly passed: Readonly<Record<string, string>>;
  readonly counters: {
    readonly sent: string;
    readonly kept: string;
    readonly placeholders: string;
    readonly checking: string;
  };
  readonly clock: { readonly typing: string; readonly running: string; readonly done: string };
  readonly run: { readonly queued: string; readonly awaiting: string; readonly resolved: string };
};

export type PlaygroundDemoProps = {
  readonly picks: ReadonlyArray<PlaygroundItem>;
  readonly languages: ReadonlyArray<PlaygroundLanguage>;
  readonly translations: PlaygroundTranslations;
  readonly sourceLocale: string;
  readonly defaultItem: string;
  readonly sent: number;
  readonly kept: number;
  readonly labels: PlaygroundLabels;
  readonly snippet: ReactNode;
  readonly snippetFile: string;
  readonly snippetConfig: PlaygroundSnippetConfig;
  readonly sdkName: string;
  readonly details: ReactNode;
};

type Announcement = { readonly run: number; readonly lines: ReadonlyArray<ReactNode> };

function textOf(translations: PlaygroundTranslations, code: string, id: string): string {
  return translations[code]?.[id] ?? "";
}

function Segments({ segments }: { segments: ReadonlyArray<Segment> }): ReactNode {
  return segments.map((segment, index) =>
    segment.placeholder ? (
      <span key={index} className="vk-ph">
        {segment.text}
      </span>
    ) : (
      <span key={index}>{segment.text}</span>
    ),
  );
}

function Reserve({
  values,
  className,
  children,
}: {
  values: ReadonlyArray<string>;
  className?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <span
      className={
        className === undefined ? "vk-playground-reserve" : `vk-playground-reserve ${className}`
      }
    >
      {[...new Set(values)].map((value) => (
        <span key={value} aria-hidden="true" className="vk-playground-ghost">
          {value}
        </span>
      ))}
      <span className="vk-playground-live">{children}</span>
    </span>
  );
}

function PauseIcon({ playing }: { playing: boolean }): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      className="vk-playground-glyph"
    >
      {playing ? <path d="M5 3v10M11 3v10" /> : <path d="M5 3l8 5-8 5z" />}
    </svg>
  );
}

function usePlaygroundMotion(
  running: boolean,
  dispatch: (action: { type: "tick"; dt: number } | { type: "start" } | { type: "settle" }) => void,
) {
  const root = useRef<HTMLDivElement>(null);
  const [motion, setMotion] = useState(false);
  const [inView, setInView] = useState(false);
  const [tabShown, setTabShown] = useState(true);

  useEffect(() => {
    setMotion(!prefersReducedMotion());
    return subscribeReducedMotion((reduced) => setMotion(!reduced));
  }, []);

  useEffect(() => {
    if (!motion) dispatch({ type: "settle" });
  }, [motion, dispatch]);

  useEffect(() => {
    if (!motion) return;
    const element = root.current;
    const observer =
      typeof IntersectionObserver === "undefined" || element === null
        ? null
        : new IntersectionObserver((entries) => {
            const last = entries.at(-1);
            if (last !== undefined) setInView(last.isIntersecting);
          });
    if (observer === null) setInView(true);
    else if (element !== null) observer.observe(element);
    const onVisibility = () => setTabShown(document.visibilityState !== "hidden");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [motion]);

  const watching = motion && inView && tabShown;

  useEffect(() => {
    if (watching) dispatch({ type: "start" });
  }, [watching, dispatch]);

  useEffect(() => {
    if (!watching || !running) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      dispatch({ type: "tick", dt: now - last });
      last = now;
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [watching, running, dispatch]);

  return { root, motion };
}

type Scene = {
  readonly frame: Frame;
  readonly tick: number;
  readonly itemId: string;
  readonly source: string;
  readonly hot: string | null;
};

function PaneHead({
  labels,
  codes,
  sourceLocale,
  phase,
  playing,
  onToggle,
}: {
  labels: PlaygroundLabels;
  codes: ReadonlyArray<string>;
  sourceLocale: string;
  phase: PlaygroundPhase;
  playing: boolean;
  onToggle: () => void;
}): ReactNode {
  return (
    <div className="vk-playground-pane-head">
      <span aria-hidden="true" className="vk-playground-dots">
        <i />
        <i />
        <i />
      </span>
      <span className="vk-playground-mono vk-playground-grow">
        {sourceLocale} <span className="vk-playground-arrow">{"\u2192"}</span> {codes.join(", ")}
      </span>
      <Reserve
        className="vk-playground-mono"
        values={[labels.clock.typing, labels.clock.running, labels.clock.done]}
      >
        {labels.clock[phase]}
      </Reserve>
      <button
        type="button"
        className="vk-playground-pause"
        aria-label={playing ? labels.pause : labels.play}
        onClick={onToggle}
      >
        <PauseIcon playing={playing} />
      </button>
    </div>
  );
}

function SourceBlock({
  label,
  sourceLocale,
  picks,
  scene,
}: {
  label: string;
  sourceLocale: string;
  picks: ReadonlyArray<PlaygroundItem>;
  scene: Scene;
}): ReactNode {
  return (
    <div className="vk-playground-source">
      <small>{label}</small>
      <p aria-hidden="true" className="vk-playground-source-text" lang={sourceLocale}>
        <span className="vk-playground-sizers">
          {picks.map((entry) => (
            <span key={entry.id} className="vk-playground-ghost">
              {entry.text}
            </span>
          ))}
          <span className="vk-playground-live">
            <Segments
              segments={typedSegments(splitPlaceholders(scene.source), scene.frame.typed)}
            />
          </span>
        </span>
      </p>
      <span className="sr-only" lang={sourceLocale}>
        {scene.source}
      </span>
    </div>
  );
}

function LanguageRow({
  language,
  index,
  picks,
  translations,
  scene,
  selected,
  onChoose,
}: {
  language: PlaygroundLanguage;
  index: number;
  picks: ReadonlyArray<PlaygroundItem>;
  translations: PlaygroundTranslations;
  scene: Scene;
  selected: string | null;
  onChoose: () => void;
}): ReactNode {
  const final = textOf(translations, language.code, scene.itemId);
  const progress = scene.frame.progress[index] ?? 0;
  const highlighted = scene.hot === language.code && (selected !== null || progress < 1);
  const variants = [
    ...new Set(picks.map((entry) => textOf(translations, language.code, entry.id))),
  ];
  return (
    <button
      type="button"
      className="vk-playground-row"
      data-lang={language.code}
      data-selected={highlighted ? "" : undefined}
      aria-pressed={selected === language.code}
      onClick={onChoose}
    >
      <span aria-hidden="true" className="vk-playground-code-tag">
        {language.code}
      </span>
      <span className="vk-playground-text">
        <span className="vk-playground-language">{language.name}</span>
        <span className="sr-only" lang={language.code}>
          {final}
        </span>
        <span aria-hidden="true" lang={language.code} className="vk-playground-sizers">
          {variants.map((text) => (
            <span key={text} className="vk-playground-ghost">
              {text}
            </span>
          ))}
          <span className="vk-playground-live">
            {progress <= 0 ? (
              <span className="vk-playground-skeleton" />
            ) : (
              <Segments
                segments={decodeSegments(final, progress, scene.tick, scramblePool(final))}
              />
            )}
          </span>
        </span>
      </span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="vk-playground-done"
        data-done={progress >= 1 ? "" : undefined}
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </button>
  );
}

function StatusBar({
  labels,
  scene,
  intact,
  sent,
  kept,
}: {
  labels: PlaygroundLabels;
  scene: Scene;
  intact: { readonly intact: number; readonly total: number };
  sent: number;
  kept: number;
}): ReactNode {
  const finished = scene.frame.phase === "done";
  const checking = scene.frame.phase === "running";
  const placeholders = finished ? `${intact.intact}/${intact.total}` : "-";
  return (
    <div className="vk-playground-status">
      <span className="vk-playground-reserve vk-playground-status-text">
        {[...new Set([labels.running, ...Object.values(labels.passed)])].map((value) => (
          <span key={value} aria-hidden="true" className="vk-playground-ghost">
            {value}
          </span>
        ))}
        <span className="vk-playground-live">
          {finished ? (
            <svg aria-hidden="true" viewBox="0 0 24 24" className="vk-playground-shield">
              <path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" />
              <path d="M8.5 12l2.5 2.5 4.5-5" />
            </svg>
          ) : (
            <span aria-hidden="true" className="vk-playground-pulse" />
          )}
          {finished ? (labels.passed[scene.itemId] ?? "") : labels.running}
        </span>
      </span>
      <span className="vk-playground-counters vk-playground-mono">
        <span>
          {labels.counters.sent} <b>{sent}</b>
        </span>
        <span>
          {labels.counters.kept} <b>{kept}</b>
        </span>
        <span>
          {labels.counters.placeholders}{" "}
          <b>
            <Reserve values={["-", `${intact.total}/${intact.total}`]}>{placeholders}</Reserve>
            {checking ? <span className="sr-only">{labels.counters.checking}</span> : null}
          </b>
        </span>
      </span>
    </div>
  );
}

function CodePane({
  labels,
  snippet,
  snippetFile,
  snippetConfig,
  sdkName,
  codes,
  phase,
  run,
}: {
  labels: PlaygroundLabels;
  snippet: ReactNode;
  snippetFile: string;
  snippetConfig: PlaygroundSnippetConfig;
  sdkName: string;
  codes: ReadonlyArray<string>;
  phase: PlaygroundPhase;
  run: number;
}): ReactNode {
  const runLabel = {
    typing: labels.run.queued,
    running: labels.run.awaiting,
    done: labels.run.resolved,
  };
  return (
    <div className="vk-playground-pane" data-pane="code">
      <CodeFrameShell
        lang="ts"
        filename={snippetFile}
        className="vk-playground-frame"
        action={
          <span className="vk-playground-frame-actions">
            <span className="vk-playground-mono vk-playground-sdk">{sdkName}</span>
            <CopyControl
              text={playgroundSnippet(snippetConfig, codes)}
              label={labels.copy}
              status={labels.copyStatus}
              size="sm"
            />
          </span>
        }
      >
        {snippet}
      </CodeFrameShell>
      <div className="vk-playground-run vk-playground-mono">
        <span>translate()</span>
        <span aria-hidden="true" className="vk-playground-bar">
          <span style={{ width: `${Math.round(run * 100)}%` }} />
        </span>
        <Reserve values={Object.values(labels.run)}>{runLabel[phase]}</Reserve>
      </div>
    </div>
  );
}

function spokenRow(language: PlaygroundLanguage, text: string): ReactNode {
  return (
    <span key={language.code}>
      {language.name}: <span lang={language.code}>{text}</span>
      {". "}
    </span>
  );
}

export function PlaygroundDemo({
  picks,
  languages,
  translations,
  sourceLocale,
  defaultItem,
  sent,
  kept,
  labels,
  snippet,
  snippetFile,
  snippetConfig,
  sdkName,
  details,
}: PlaygroundDemoProps): ReactNode {
  const codes = languages.map((language) => language.code);
  const durations = picks.map((pick) => sceneEnd(pick.text.length, codes.length));
  const [state, send] = useReducer(
    (current: CycleState, action: CycleAction) => cycleReducer(current, action, durations),
    Math.max(
      0,
      picks.findIndex((pick) => pick.id === defaultItem),
    ),
    initialCycle,
  );
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const { root, motion } = usePlaygroundMotion(cycleRunning(state, durations), send);

  const pick = picks[state.item];
  const source = pick?.text ?? "";
  const itemId = pick?.id ?? defaultItem;
  const frame = frameAt(state.elapsed, source.length, codes.length);
  const scene: Scene = {
    frame,
    itemId,
    source,
    tick: Number.isFinite(state.elapsed) ? Math.floor(state.elapsed / SCRAMBLE_TICK_MS) : 0,
    hot: state.selected ?? codes[frame.active] ?? null,
  };
  const intact = intactPlaceholders(
    source,
    codes.map((code) => textOf(translations, code, itemId)),
  );
  const rootStyle: CSSProperties =
    scene.hot === null ? {} : { [snippetHotVar(scene.hot)]: "var(--vk-hot-fill)" };

  const announce = (lines: ReadonlyArray<ReactNode>) =>
    setAnnouncement((current) => ({ run: (current?.run ?? 0) + 1, lines }));

  const choose = (index: number) => {
    const next = picks[index];
    if (next === undefined) return;
    send({ type: "pick-item", index, instant: !motion });
    announce(
      languages.map((language) =>
        spokenRow(language, textOf(translations, language.code, next.id)),
      ),
    );
  };

  const chooseLanguage = (language: PlaygroundLanguage) => {
    send({ type: "pick-language", code: language.code });
    announce([spokenRow(language, textOf(translations, language.code, itemId))]);
  };

  return (
    <div
      ref={root}
      className="vk-playground"
      data-playground-demo=""
      data-item={itemId}
      data-phase={frame.phase}
      data-playing={state.playing ? "" : undefined}
      style={rootStyle}
    >
      <div className="vk-playground-pane" data-pane="result">
        <PaneHead
          labels={labels}
          codes={codes}
          sourceLocale={sourceLocale}
          phase={frame.phase}
          playing={state.playing}
          onToggle={() => send({ type: "toggle-play" })}
        />
        <SourceBlock
          label={labels.source}
          sourceLocale={sourceLocale}
          picks={picks}
          scene={scene}
        />
        <fieldset className="vk-playground-picks">
          <legend className="sr-only">{labels.items}</legend>
          {picks.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              lang={sourceLocale}
              className="vk-playground-pick"
              aria-pressed={entry.id === itemId}
              onClick={() => choose(index)}
            >
              {entry.text}
            </button>
          ))}
        </fieldset>
        <fieldset className="vk-playground-rows">
          <legend className="sr-only">{labels.languages}</legend>
          {languages.map((language, index) => (
            <LanguageRow
              key={language.code}
              language={language}
              index={index}
              picks={picks}
              translations={translations}
              scene={scene}
              selected={state.selected}
              onChoose={() => chooseLanguage(language)}
            />
          ))}
        </fieldset>
        <StatusBar labels={labels} scene={scene} intact={intact} sent={sent} kept={kept} />
        <div aria-live="polite" aria-atomic="true" className="sr-only" data-playground-live="">
          {announcement === null ? null : <span key={announcement.run}>{announcement.lines}</span>}
        </div>
      </div>
      <CodePane
        labels={labels}
        snippet={snippet}
        snippetFile={snippetFile}
        snippetConfig={snippetConfig}
        sdkName={sdkName}
        codes={codes}
        phase={frame.phase}
        run={frame.run}
      />
      <div className="vk-playground-foot">{details}</div>
    </div>
  );
}

function typedSegments(segments: ReadonlyArray<Segment>, count: number): ReadonlyArray<Segment> {
  const out: Segment[] = [];
  let left = count;
  for (const segment of segments) {
    if (left <= 0) break;
    out.push({ text: segment.text.slice(0, left), placeholder: segment.placeholder });
    left -= segment.text.length;
  }
  return out;
}
