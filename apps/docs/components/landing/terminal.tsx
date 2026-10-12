"use client";

import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/reduced-motion";
import { useInView } from "@/lib/use-in-view";
import { cn } from "@/lib/utils";
import { PlaceholderText } from "./placeholder-chip";
import { WrapTokens, wrapLineStyle } from "./wrap-text";

type Line = { kind: "command" | "output"; text: string };

export type TerminalProgress = { lines: number; typing: boolean };

export type TerminalProps = {
  commands: ReadonlyArray<string>;
  outputs?: Readonly<Record<number, ReadonlyArray<string>>>;
  title?: string;
  sessionLabel: string;
  typingSpeed?: number;
  delayBetweenCommands?: number;
  initialDelay?: number;
  lineDelay?: number;
  onProgress?: (progress: TerminalProgress) => void;
  highlight?: string;
  fitContent?: boolean;
  headerAction?: ReactNode;
  bare?: boolean;
  wrap?: boolean;
  playThreshold?: number;
  play?: boolean;
  pauseOffscreen?: boolean;
  settledCommands?: number;
  className?: string;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Frame = { readonly history: Line[]; readonly typing: string | null; readonly wait: number };

type TimelineOptions = {
  readonly commands: ReadonlyArray<string>;
  readonly outputs?: Readonly<Record<number, ReadonlyArray<string>>> | undefined;
  readonly typingSpeed: number;
  readonly lineDelay: number;
  readonly delayBetweenCommands: number;
  readonly initialDelay: number;
};

const COMMAND_PAUSE_MS = 320;

function buildPass(options: TimelineOptions, start: number): Frame[] {
  const { commands, outputs } = options;
  let history = buildSettled(commands.slice(0, start), outputs);
  let typing: string | null = start === 0 ? "" : null;
  const frames: Frame[] = [{ history, typing, wait: options.initialDelay }];
  commands.slice(start).forEach((cmd, offset) => {
    for (let c = 1; c <= cmd.length; c += 1) {
      typing = cmd.slice(0, c);
      frames.push({ history, typing, wait: options.typingSpeed });
    }
    typing = null;
    history = [...history, { kind: "command", text: cmd }];
    frames.push({ history, typing, wait: COMMAND_PAUSE_MS });
    for (const text of outputs?.[start + offset] ?? []) {
      history = [...history, { kind: "output", text }];
      frames.push({ history, typing, wait: options.lineDelay });
    }
    const last = frames.at(-1);
    if (last)
      frames[frames.length - 1] = { ...last, wait: last.wait + options.delayBetweenCommands };
  });
  return frames;
}

type Cursor = { timeline: Frame[]; index: number; finished: boolean };

type Playback = {
  readonly cursor: Cursor;
  readonly isCancelled: () => boolean;
  readonly show: (frame: Frame) => void;
};

async function playFrom(playback: Playback): Promise<void> {
  const { cursor } = playback;
  const frames = cursor.timeline;
  while (cursor.index < frames.length) {
    const frame = frames[cursor.index];
    if (!frame || playback.isCancelled()) return;
    playback.show(frame);
    await delay(frame.wait);
    if (playback.isCancelled()) return;
    cursor.index += 1;
  }
  cursor.finished = true;
}

function buildSettled(
  commands: ReadonlyArray<string>,
  outputs?: Readonly<Record<number, ReadonlyArray<string>>>,
): Line[] {
  const settled: Line[] = [];
  commands.forEach((cmd, i) => {
    settled.push({ kind: "command", text: cmd });
    for (const text of outputs?.[i] ?? []) settled.push({ kind: "output", text });
  });
  return settled;
}

function tokenColor(token: string): string | undefined {
  if (token === "✓") return "var(--v-glow)";
  if (token.startsWith("-")) return "var(--v-glow-soft)";
  if (/^["'].*["']$/.test(token)) return "var(--text-strong)";
  if (/^\d+$/.test(token)) return "var(--v-glow)";
  return undefined;
}

function HighlightedText({ text, base }: { text: string; base: string }): ReactNode {
  return (
    <WrapTokens
      text={text}
      render={(token) => (
        <span style={{ color: tokenColor(token) ?? base }}>
          <PlaceholderText text={token} />
        </span>
      )}
    />
  );
}

const HIGHLIGHT_STYLE = {
  background: "color-mix(in srgb, var(--v-purple) 22%, transparent)",
  borderInlineStart: "3px solid var(--v-purple)",
} as const;

const LINE_CLASS = {
  scroll: "whitespace-pre",
  wrap: "vk-wrap-line",
} as const;

type LineMode = keyof typeof LINE_CLASS;

function LineRow({
  line,
  mode,
  highlighted = false,
}: {
  line: Line;
  mode: LineMode;
  highlighted?: boolean;
}): ReactNode {
  const style = mode === "wrap" ? wrapLineStyle(line.text) : undefined;
  if (line.kind === "command") {
    return (
      <div className={LINE_CLASS[mode]} style={style}>
        <span style={{ color: "var(--v-glow)" }}>$</span>{" "}
        <HighlightedText text={line.text} base="var(--text-strong)" />
      </div>
    );
  }
  if (highlighted) {
    return (
      <div
        className={cn(
          LINE_CLASS[mode],
          "-mx-4 pe-4",
          mode === "wrap" ? "ps-[calc(13px+var(--wrap-indent))]" : "ps-[13px]",
        )}
        style={{ ...HIGHLIGHT_STYLE, ...style }}
      >
        <HighlightedText text={line.text} base="var(--text-strong)" />
      </div>
    );
  }
  return (
    <div className={LINE_CLASS[mode]} style={style}>
      <HighlightedText text={line.text} base="var(--text-muted)" />
    </div>
  );
}

function LineList({
  lines,
  mode,
  highlight,
}: {
  lines: ReadonlyArray<Line>;
  mode: LineMode;
  highlight?: string | undefined;
}): ReactNode {
  return lines.map((line, index) => (
    <LineRow
      key={`${index}:${line.kind}`}
      line={line}
      mode={mode}
      highlighted={line.kind === "output" && line.text === highlight}
    />
  ));
}

function usePlaybackView(
  threshold: number,
  play: boolean | undefined,
  pauseOffscreen: boolean,
): [RefObject<HTMLDivElement | null>, boolean] {
  const [ref, inView] = useInView<HTMLDivElement>(threshold, { once: !pauseOffscreen });
  return [ref, play ?? inView];
}

export function Terminal({
  commands,
  outputs,
  title,
  sessionLabel,
  typingSpeed = 45,
  delayBetweenCommands = 900,
  initialDelay = 500,
  lineDelay = 90,
  onProgress,
  highlight,
  fitContent = false,
  headerAction,
  bare = false,
  wrap = false,
  playThreshold = 0.4,
  play,
  pauseOffscreen = false,
  settledCommands = 0,
  className,
}: TerminalProps): ReactNode {
  const [rootRef, inView] = usePlaybackView(playThreshold, play, pauseOffscreen);
  const mode: LineMode = wrap ? "wrap" : "scroll";
  const widthClass = wrap ? "min-w-0" : "min-w-max";
  const scrollRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<Line[]>(() =>
    buildSettled(commands.slice(0, settledCommands), outputs),
  );
  const [typing, setTyping] = useState<string | null>(null);

  const timeline = useMemo(
    () =>
      buildPass(
        { commands, outputs, typingSpeed, lineDelay, delayBetweenCommands, initialDelay },
        settledCommands,
      ),
    [
      commands,
      outputs,
      typingSpeed,
      lineDelay,
      delayBetweenCommands,
      initialDelay,
      settledCommands,
    ],
  );
  const cursorRef = useRef<Cursor>({ timeline, index: 0, finished: false });

  useEffect(() => {
    if (!inView) return;
    if (cursorRef.current.timeline !== timeline) {
      cursorRef.current = { timeline, index: 0, finished: false };
    }
    const cursor = cursorRef.current;

    if (prefersReducedMotion()) {
      cursor.finished = true;
      setHistory(buildSettled(commands, outputs));
      setTyping(null);
      return;
    }
    if (cursor.finished) return;

    let cancelled = false;
    void playFrom({
      cursor,
      isCancelled: () => cancelled,
      show: (frame) => {
        setHistory(frame.history);
        setTyping(frame.typing);
        requestAnimationFrame(() => {
          const el = scrollRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      },
    });

    return () => {
      cancelled = true;
    };
  }, [inView, timeline, commands, outputs]);

  const shown = history.length;
  const typingNow = typing !== null;
  useEffect(() => {
    onProgress?.({ lines: shown, typing: typingNow });
  }, [onProgress, shown, typingNow]);

  return (
    <div
      ref={rootRef}
      className={cn(
        "not-prose flex flex-col",
        !bare && "overflow-hidden rounded-xl border border-fd-border",
        className,
      )}
      style={bare ? undefined : { background: "var(--surface-bg)" }}
    >
      {bare ? null : (
        <div className="flex items-center justify-between gap-3 border-b border-fd-border px-4 py-2.5">
          {title ? (
            <span className="font-mono text-xs text-fd-muted-foreground">{title}</span>
          ) : null}
          {headerAction ? <span className="ms-auto flex">{headerAction}</span> : null}
        </div>
      )}

      <div className="sr-only">
        <p>{sessionLabel}</p>
        <ol>
          {commands.map((cmd, i) => (
            <li key={`${i}:${cmd}`}>
              <span>{cmd}</span>
              <ul>
                {(outputs?.[i] ?? []).map((out, j) => (
                  <li key={`${j}:${out}`}>{out}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>

      <div
        ref={scrollRef}
        aria-hidden="true"
        className={cn(
          "vk-terminal-scroll px-4 py-4 font-mono leading-relaxed",
          fitContent ? "grid flex-1 content-start" : "h-80 overflow-y-auto",
          bare ? "text-xs sm:text-sm md:px-5 md:py-5" : "text-sm",
        )}
      >
        {fitContent ? (
          <div className={cn("invisible col-start-1 row-start-1", widthClass)}>
            <LineList lines={buildSettled(commands, outputs)} mode={mode} highlight={highlight} />
          </div>
        ) : null}
        <div className={cn(widthClass, fitContent && "col-start-1 row-start-1")}>
          <LineList lines={history} mode={mode} highlight={highlight} />
          {typing !== null ? (
            <div className={LINE_CLASS[mode]} data-typing="">
              <span style={{ color: "var(--v-glow)" }}>$</span>{" "}
              <HighlightedText text={typing} base="var(--text-strong)" />
              <span key={typing.length} className="vk-terminal-caret" aria-hidden="true" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
