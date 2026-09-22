"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/reduced-motion";
import { useInViewOnce } from "@/lib/use-in-view-once";
import { cn } from "@/lib/utils";

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
};

async function typeCommand(ctx: PlayerContext, cmd: string): Promise<boolean> {
  for (let c = 1; c <= cmd.length; c += 1) {
    if (ctx.isCancelled()) return false;
    ctx.setTyping(cmd.slice(0, c));
    ctx.scroll();
    await delay(ctx.typingSpeed);
  }
  return true;
}

async function printOutputs(ctx: PlayerContext, lines: ReadonlyArray<string>): Promise<boolean> {
  for (const text of lines) {
    if (ctx.isCancelled()) return false;
    ctx.pushLine({ kind: "output", text });
    ctx.scroll();
    await delay(90);
  }
  return true;
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
  while (!ctx.isCancelled()) {
    ctx.reset();
    await delay(ctx.initialDelay);
    for (let i = 0; i < ctx.commands.length; i += 1) {
      const cmd = ctx.commands[i];
      if (cmd === undefined) continue;
      if (!(await runCommand(ctx, cmd, ctx.outputs?.[i] ?? []))) return;
    }
    if (!ctx.loop) return;
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
  const tokens = text.split(" ");
  return (
    <>
      {tokens.map((token, i) => (
        <span key={i} style={{ color: tokenColor(token) ?? base }}>
          {i > 0 ? " " : ""}
          {token}
        </span>
      ))}
    </>
  );
}

const HIGHLIGHT_STYLE = {
  background: "color-mix(in srgb, var(--v-purple) 22%, transparent)",
  borderInlineStart: "3px solid var(--v-purple)",
} as const;

function LineRow({ line, highlighted = false }: { line: Line; highlighted?: boolean }): ReactNode {
  if (line.kind === "command") {
    return (
      <div className="whitespace-pre-wrap">
        <span style={{ color: "var(--v-glow)" }}>$</span>{" "}
        <HighlightedText text={line.text} base="var(--text-strong)" />
      </div>
    );
  }
  if (highlighted) {
    return (
      <div className="-mx-4 whitespace-pre-wrap ps-[13px] pe-4" style={HIGHLIGHT_STYLE}>
        <HighlightedText text={line.text} base="var(--text-strong)" />
      </div>
    );
  }
  return (
    <div className="whitespace-pre-wrap">
      <HighlightedText text={line.text} base="var(--text-muted)" />
    </div>
  );
}

function LineList({
  lines,
  highlight,
}: {
  lines: ReadonlyArray<Line>;
  highlight?: string | undefined;
}): ReactNode {
  return lines.map((line) => (
    <LineRow
      key={`${line.kind}:${line.text}`}
      line={line}
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
  className,
}: TerminalProps): ReactNode {
  const [rootRef, inView] = useInViewOnce<HTMLDivElement>(0.4);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<Line[]>([]);
  const [typing, setTyping] = useState<string | null>(null);

  useEffect(() => {
    if (!inView) return;

    if (prefersReducedMotion()) {
      setHistory(buildSettled(commands, outputs));
      setTyping(null);
      return;
    }

    let cancelled = false;
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
    };
    void playLoop(ctx);

    return () => {
      cancelled = true;
    };
  }, [inView, commands, outputs, typingSpeed, delayBetweenCommands, initialDelay, loop]);

  return (
    <div
      ref={rootRef}
      className={cn(
        "not-prose flex flex-col overflow-hidden rounded-xl border border-fd-border",
        className,
      )}
      style={{ background: "var(--surface-bg)" }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-fd-border px-4 py-2.5">
        {title ? <span className="font-mono text-xs text-fd-muted-foreground">{title}</span> : null}
        {headerAction ? <span className="ms-auto flex">{headerAction}</span> : null}
      </div>

      <div className="sr-only">
        <p>{sessionLabel}</p>
        <ol>
          {commands.map((cmd, i) => (
            <li key={cmd}>
              <span>{cmd}</span>
              <ul>
                {(outputs?.[i] ?? []).map((out) => (
                  <li key={out}>{out}</li>
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
          "px-4 py-4 font-mono text-[13px] leading-relaxed",
          fitContent ? "grid flex-1 content-start" : "h-80 overflow-y-auto",
        )}
        style={{ background: "var(--v-void)" }}
      >
        {fitContent ? (
          <div className="invisible col-start-1 row-start-1">
            <LineList lines={buildSettled(commands, outputs)} highlight={highlight} />
          </div>
        ) : null}
        <div className={cn(fitContent && "col-start-1 row-start-1")}>
          <LineList lines={history} highlight={highlight} />
          {typing !== null ? (
            <div className="whitespace-pre-wrap">
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
