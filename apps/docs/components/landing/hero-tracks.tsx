"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { TabList, tabPanelProps } from "@/components/ui/tabs";
import { withInlineCode } from "@/lib/inline-code-text";
import type { LandingTrackId } from "@/lib/landing-tracks";
import { prefersReducedMotion } from "@/lib/reduced-motion";

export const HERO_TRACKS_ID = "hero-track";

export const TYPE_CHAR_MS = 14;
export const TYPE_COMMAND_PAUSE_MS = 260;
export const TYPE_LINE_MS = 110;

export const LOAD_RUN_THRESHOLD = 0.2;

export type HeroTrackFile = { readonly filename: string; readonly code: string };

export type HeroTrackView = {
  readonly id: LandingTrackId;
  readonly tab: string;
  readonly summary: string;
  readonly link: string;
  readonly href: string;
  readonly title: string;
  readonly commands: ReadonlyArray<string>;
  readonly result: ReadonlyArray<string>;
  readonly files: ReadonlyArray<HeroTrackFile>;
  readonly exit: { readonly code: number; readonly label: string } | null;
};

type LineState = "pending" | "typing" | "done";

type KeyedLine = { readonly key: string; readonly text: string };

function keyedLines(prefix: string, lines: ReadonlyArray<string>): ReadonlyArray<KeyedLine> {
  return lines.map((text, position) => ({ key: `${prefix}-${position}`, text }));
}

function outputs(track: HeroTrackView): ReadonlyArray<string> {
  return track.result.length > 0 ? track.result : track.files.map((file) => file.filename);
}

function commandStart(track: HeroTrackView, index: number): number {
  return track.commands.slice(0, index).reduce((sum, command) => sum + command.length, 0);
}

export function trackStepCount(track: HeroTrackView): number {
  return commandStart(track, track.commands.length) + outputs(track).length;
}

export function stepDelay(track: HeroTrackView, step: number): number {
  const typed = commandStart(track, track.commands.length);
  if (step >= typed) return TYPE_LINE_MS;
  const ends = track.commands.some((_, index) => commandStart(track, index + 1) === step + 1);
  return ends ? TYPE_COMMAND_PAUSE_MS : TYPE_CHAR_MS;
}

function commandState(track: HeroTrackView, index: number, step: number | null): LineState {
  if (step === null) return "done";
  const start = commandStart(track, index);
  const length = track.commands[index]?.length ?? 0;
  if (step < start) return "pending";
  return step < start + length ? "typing" : "done";
}

function outputState(track: HeroTrackView, index: number, step: number | null): LineState {
  if (step === null) return "done";
  return step > commandStart(track, track.commands.length) + index ? "done" : "pending";
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
            <span className="vk-track-caret" />
          </span>
        ) : null}
      </span>
    </p>
  );
}

function TrackOutput({ track, step }: { track: HeroTrackView; step: number | null }): ReactNode {
  if (track.result.length > 0) {
    return keyedLines(`${track.id}-out`, track.result).map((line, index) => (
      <p
        key={line.key}
        className="vk-track-line vk-track-out"
        data-state={outputState(track, index, step)}
      >
        {line.text}
      </p>
    ));
  }
  return track.files.map((file, index) => (
    <figure
      key={file.filename}
      className="vk-track-file"
      data-state={outputState(track, index, step)}
    >
      <figcaption className="vk-track-file-name">{file.filename}</figcaption>
      <pre className="vk-track-file-code">
        <code>{file.code.trimEnd()}</code>
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
              data-state={outputState(track, outputs(track).length - 1, run)}
            >
              {track.exit.label}
            </span>
          )}
        </div>
        <div className="vk-track-body" lang="en">
          {keyedLines(`${track.id}-command`, track.commands).map((command, index) => (
            <CommandLine
              key={command.key}
              command={command.text}
              state={commandState(track, index, run)}
              typed={run === null ? command.text.length : run - commandStart(track, index)}
            />
          ))}
          <TrackOutput track={track} step={run} />
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
