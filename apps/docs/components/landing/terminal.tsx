"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/reduced-motion";
import { useInViewOnce } from "@/lib/use-in-view-once";
import { cn } from "@/lib/utils";
import { WrapTokens, wrapLineStyle } from "./wrap-text";

type Line = { kind: "command" | "output"; text: string };

export type TerminalProps = {
  commands: ReadonlyArray<string>;
  outputs?: Readonly<Record<number, ReadonlyArray<string>>>;
  title?: string;
  sessionLabel: string;
  typingSpeed?: number;
  delayBetweenCommands?: number;
  initialDelay?: number;
  loop?: boolean;
  highlight?: string;
  fitContent?: boolean;
  headerAction?: ReactNode;
  bare?: boolean;
  wrap?: boolean;
  playThreshold?: number;
  settledCommands?: number;
  className?: string;
};

const HOLD_PAUSE_MS = 2600;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type PlayerContext = {
  isCancelled: () => boolean;
  setTyping: (value: string | null) => void;
  pushLine: (line: Line) => void;
  reset: () => void;
  scroll: () => void;
  commands: ReadonlyArray<string>;
  outputs?: Readonly<Record<number, ReadonlyArray<string>>>;
  typingSpeed: number;
  delayBetweenCommands: number;
  initialDelay: number;
  loop: boolean;
  settledCommands: number;
};

async function typeCommand(ctx: PlayerContext, cmd: string): Promise<boolean> {
  for (let c = 1; c <= cmd.length; c += 1) {
    if (ctx.isCancelled()) return false;
    ctx.setTyping(cmd.slice(0, c));
    ctx.scroll();
    await delay(ctx.typingSpeed);
  }
  return !ctx.isCancelled();
}

async function printOutputs(ctx: PlayerContext, lines: ReadonlyArray<string>): Promise<boolean> {
  for (const text of lines) {
    if (ctx.isCancelled()) return false;
    ctx.pushLine({ kind: "output", text });
    ctx.scroll();
    await delay(90);
  }
  return !ctx.isCancelled();
}

async function runCommand(
  ctx: PlayerContext,
  cmd: string,
  out: ReadonlyArray<string>,
): Promise<boolean> {
  if (!(await typeCommand(ctx, cmd))) return false;
  ctx.setTyping(null);
  ctx.pushLine({ kind: "command", text: cmd });
  ctx.scroll();
  await delay(320);
  if (!(await printOutputs(ctx, out))) return false;
  await delay(ctx.delayBetweenCommands);
  return true;
}

async function playLoop(ctx: PlayerContext): Promise<void> {
  let start = ctx.settledCommands;
  while (!ctx.isCancelled()) {
    if (start === 0) ctx.reset();
    await delay(ctx.initialDelay);
    for (let i = start; i < ctx.commands.length; i += 1) {
      const cmd = ctx.commands[i];
      if (cmd === undefined) continue;
      if (!(await runCommand(ctx, cmd, ctx.outputs?.[i] ?? []))) return;
    }
    if (!ctx.loop) return;
    start = 0;
    await delay(HOLD_PAUSE_MS);
  }
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
  if (/^["'].*["']$/.test(token)) return "var(--v-pink)";
  if (/^\d+$/.test(token)) return "var(--v-glow)";
  return undefined;
}

function HighlightedText({ text, base }: { text: string; base: string }): ReactNode {
  return (
    <WrapTokens
      text={text}
      render={(token) => <span style={{ color: tokenColor(token) ?? base }}>{token}</span>}
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

export function Terminal({
  commands,
  outputs,
  title,
  sessionLabel,
  typingSpeed = 45,
  delayBetweenCommands = 900,
  initialDelay = 500,
  loop = true,
  highlight,
  fitContent = false,
  headerAction,
  bare = false,
  wrap = false,
  playThreshold = 0.4,
  settledCommands = 0,
  className,
}: TerminalProps): ReactNode {
  const [rootRef, inView] = useInViewOnce<HTMLDivElement>(playThreshold);
  const mode: LineMode = wrap ? "wrap" : "scroll";
  const widthClass = wrap ? "min-w-0" : "min-w-max";
  const scrollRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<Line[]>(() =>
    buildSettled(commands.slice(0, settledCommands), outputs),
  );
  const [typing, setTyping] = useState<string | null>(null);

  useEffect(() => {
    if (!inView) return;

    if (prefersReducedMotion()) {
      setHistory(buildSettled(commands, outputs));
      setTyping(null);
      return;
    }

    let cancelled = false;
    setHistory(buildSettled(commands.slice(0, settledCommands), outputs));
    setTyping(null);
    const ctx: PlayerContext = {
      isCancelled: () => cancelled,
      setTyping,
      pushLine: (line) => setHistory((h) => [...h, line]),
      reset: () => {
        setHistory([]);
        setTyping("");
      },
      scroll: () => {
        requestAnimationFrame(() => {
          const el = scrollRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      },
      commands,
      outputs,
      typingSpeed,
      delayBetweenCommands,
      initialDelay,
      loop,
      settledCommands,
    };
    void playLoop(ctx);

    return () => {
      cancelled = true;
    };
  }, [
    inView,
    commands,
    outputs,
    typingSpeed,
    delayBetweenCommands,
    initialDelay,
    loop,
    settledCommands,
  ]);

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
            <div className={LINE_CLASS[mode]}>
              <span style={{ color: "var(--v-glow)" }}>$</span>{" "}
              <HighlightedText text={typing} base="var(--text-strong)" />
              <span className="ms-0.5 animate-pulse" style={{ color: "var(--v-glow)" }}>
                &#9613;
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
