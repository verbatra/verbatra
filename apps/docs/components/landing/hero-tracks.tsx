"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { TabList, tabPanelProps } from "@/components/ui/tabs";
import { msSinceFirstContentfulPaint } from "@/lib/first-paint";
import { withInlineCode } from "@/lib/inline-code-text";
import type { LandingTrackId } from "@/lib/landing-tracks";
import { prefersReducedMotion } from "@/lib/reduced-motion";

export const HERO_TRACKS_ID = "hero-track";

export const TYPE_CHAR_MS = 14;
export const TYPE_COMMAND_PAUSE_MS = 260;
export const TYPE_LINE_MS = 110;

export const LOAD_RUN_THRESHOLD = 0.2;

export const LOAD_RUN_LATE_MS = 300;

function hydratedLate(): boolean {
  const since = msSinceFirstContentfulPaint();
  return since !== null && since > LOAD_RUN_LATE_MS;
}

export type HeroTrackFile = { readonly filename: string; readonly code: string };

export type HeroTrackStep = { readonly command: string; readonly output: ReadonlyArray<string> };

export type HeroTrackView = {
  readonly id: LandingTrackId;
  readonly tab: string;
  readonly summary: string;
  readonly link: string;
  readonly href: string;
  readonly title: string;
  readonly steps: ReadonlyArray<HeroTrackStep>;
  readonly files: ReadonlyArray<HeroTrackFile>;
  readonly exit: { readonly code: number; readonly label: string } | null;
};

type LineState = "pending" | "typing" | "done";

type KeyedLine = { readonly key: string; readonly text: string };

function keyedLines(prefix: string, lines: ReadonlyArray<string>): ReadonlyArray<KeyedLine> {
  return lines.map((text, position) => ({ key: `${prefix}-${position}`, text }));
}

function stepLength(step: HeroTrackStep): number {
  return step.command.length + step.output.length;
}

function stepStart(track: HeroTrackView, index: number): number {
  return track.steps.slice(0, index).reduce((sum, step) => sum + stepLength(step), 0);
}

function filesStart(track: HeroTrackView): number {
  return stepStart(track, track.steps.length);
}

export function trackStepCount(track: HeroTrackView): number {
  return filesStart(track) + track.files.length;
}

export function stepDelay(track: HeroTrackView, step: number): number {
  const index = track.steps.findIndex((_, at) => step < stepStart(track, at + 1));
  const current = track.steps[index];
  if (current === undefined) return TYPE_LINE_MS;
  const typed = step - stepStart(track, index);
  if (typed >= current.command.length) return TYPE_LINE_MS;
  return typed === current.command.length - 1 ? TYPE_COMMAND_PAUSE_MS : TYPE_CHAR_MS;
}

function commandState(track: HeroTrackView, index: number, step: number | null): LineState {
  if (step === null) return "done";
  const start = stepStart(track, index);
  const length = track.steps[index]?.command.length ?? 0;
  if (step < start) return "pending";
  return step < start + length ? "typing" : "done";
}

function lineState(position: number, step: number | null): LineState {
  if (step === null) return "done";
  return step > position ? "done" : "pending";
}

function outputPosition(track: HeroTrackView, index: number, line: number): number {
  return stepStart(track, index) + (track.steps[index]?.command.length ?? 0) + line;
}

function CommandLine({
  command,
  state,
  typed,
}: {
  command: string;
  state: LineState;
  typed: number;
}): ReactNode {
  return (
    <p className="vk-track-line vk-track-command" data-state={state}>
      <span aria-hidden="true" className="vk-track-sign">
        $
      </span>
      <span className="vk-track-type">
        <code className="vk-track-text">{command}</code>
        {state === "typing" ? (
          <span aria-hidden="true" className="vk-track-typed">
            {command.slice(0, typed)}
            <span key={typed} className="vk-track-caret" />
          </span>
        ) : null}
      </span>
    </p>
  );
}

function TrackStepLines({
  track,
  index,
  step,
}: {
  track: HeroTrackView;
  index: number;
  step: number | null;
}): ReactNode {
  const current = track.steps[index];
  if (current === undefined) return null;
  return (
    <>
      <CommandLine
        command={current.command}
        state={commandState(track, index, step)}
        typed={step === null ? current.command.length : step - stepStart(track, index)}
      />
      {keyedLines(`${track.id}-${index}-out`, current.output).map((line, position) => (
        <p
          key={line.key}
          className="vk-track-line vk-track-out"
          data-state={lineState(outputPosition(track, index, position), step)}
        >
          {line.text}
        </p>
      ))}
    </>
  );
}

const LEADING_SPACES = /^ */;

function FileLine({ text, last }: { text: string; last: boolean }): ReactNode {
  const indent = LEADING_SPACES.exec(text)?.[0] ?? "";
  return (
    <span className="vk-track-file-line">
      <span className="vk-track-file-indent">{indent}</span>
      <span className="vk-track-file-text">
        {text.slice(indent.length)}
        {last ? "" : "\n"}
      </span>
    </span>
  );
}

function TrackFiles({ track, step }: { track: HeroTrackView; step: number | null }): ReactNode {
  return track.files.map((file, index) => (
    <figure
      key={file.filename}
      className="vk-track-file"
      data-state={lineState(filesStart(track) + index, step)}
    >
      <figcaption className="vk-track-file-name">{file.filename}</figcaption>
      <pre className="vk-track-file-code">
        <code>
          {keyedLines(`${file.filename}-line`, file.code.trimEnd().split("\n")).map(
            (line, position, lines) => (
              <FileLine key={line.key} text={line.text} last={position === lines.length - 1} />
            ),
          )}
        </code>
      </pre>
    </figure>
  ));
}

function TrackPanel({
  track,
  active,
  step,
}: {
  track: HeroTrackView;
  active: LandingTrackId;
  step: number | null;
}): ReactNode {
  const run = track.id === active ? step : null;
  return (
    <div {...tabPanelProps(HERO_TRACKS_ID, track.id, active)} className="vk-track-panel">
      <div className="vk-track-terminal" data-track={track.id}>
        <div className="vk-track-bar">
          <span className="vk-track-title">{track.title}</span>
          {track.exit === null ? null : (
            <span
              className="vk-track-exit"
              data-exit={track.exit.code === 0 ? "ok" : "fail"}
              data-state={lineState(trackStepCount(track) - 1, run)}
            >
              {track.exit.label}
            </span>
          )}
        </div>
        <div className="vk-track-body" lang="en">
          {keyedLines(
            `${track.id}-step`,
            track.steps.map((entry) => entry.command),
          ).map((entry, index) => (
            <TrackStepLines key={entry.key} track={track} index={index} step={run} />
          ))}
          <TrackFiles track={track} step={run} />
        </div>
      </div>
      <p className="vk-track-summary">
        {withInlineCode(track.summary)}{" "}
        <a href={track.href} className="vk-prose-link">
          {track.link}
        </a>
      </p>
    </div>
  );
}

function useTypingRun(track: HeroTrackView | undefined): [number | null, () => void] {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    if (step === null || track === undefined) return;
    if (step >= trackStepCount(track)) {
      setStep(null);
      return;
    }
    const timer = window.setTimeout(() => setStep(step + 1), stepDelay(track, step));
    return () => window.clearTimeout(timer);
  }, [step, track]);

  const start = useCallback(() => setStep(prefersReducedMotion() ? null : 0), []);
  return [step, start];
}

function useLoadRun(start: () => void): [(node: HTMLDivElement | null) => void, () => void] {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const chosen = useRef(false);

  useEffect(() => {
    if (hydratedLate()) chosen.current = true;
  }, []);

  useEffect(() => {
    if (node === null || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        if (!chosen.current) start();
      },
      { threshold: LOAD_RUN_THRESHOLD },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, start]);

  return [
    setNode,
    () => {
      chosen.current = true;
    },
  ];
}

export function HeroTracks({
  tracks,
  label,
}: {
  tracks: ReadonlyArray<HeroTrackView>;
  label: string;
}): ReactNode {
  const [active, setActive] = useState<LandingTrackId>(tracks[0]?.id ?? "translate");
  const current = tracks.find((track) => track.id === active);
  const [step, start] = useTypingRun(current);
  const [observe, markChosen] = useLoadRun(start);

  function select(id: string) {
    const next = tracks.find((track) => track.id === id);
    if (next === undefined || next.id === active) return;
    markChosen();
    setActive(next.id);
    start();
  }

  return (
    <div ref={observe} className="vk-tracks" data-typing={step === null ? undefined : "true"}>
      <TabList
        tabs={tracks.map((track) => ({ id: track.id, label: track.tab }))}
        active={active}
        onSelect={select}
        ariaLabel={label}
        variant="segmented"
        idPrefix={HERO_TRACKS_ID}
        className="vk-tracks-tabs"
      />
      <div className="vk-tracks-panels">
        {tracks.map((track) => (
          <TrackPanel key={track.id} track={track} active={active} step={step} />
        ))}
      </div>
    </div>
  );
}
