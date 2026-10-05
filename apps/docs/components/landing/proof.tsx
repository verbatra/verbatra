import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  GATE_CLI_COMMAND,
  GATE_LOCK_FILE,
  GATE_LOCK_LINES,
  GATE_REFUSAL,
  GATE_RUN_LINES,
  GATE_TARGET_LINES,
  type GateLine,
} from "@/lib/gate-demo";
import { cn } from "@/lib/utils";
import { Section } from "./section";
import { SectionHead } from "./section-head";
import { Terminal } from "./terminal";

const MONO = "font-mono text-sm leading-relaxed";

const HIGHLIGHT_STYLE = {
  background: "color-mix(in srgb, var(--v-purple) 22%, transparent)",
  borderInlineStart: "3px solid var(--v-purple)",
} as const;

const GATE_OUTPUTS = { 0: GATE_RUN_LINES } as const;

const STEP_KEYS = ["configure", "diff", "translate", "verifyWrite"] as const;

function Region({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div className="flex min-w-0 flex-col" style={{ background: "var(--surface-bg)" }}>
      <div className="px-6 pt-[22px] pb-[18px]">
        <h3 className="vk-h4">{title}</h3>
        <p className="mt-1.5 max-w-[48ch] text-sm text-fd-muted-foreground">{body}</p>
      </div>
      <div
        className={cn(
          MONO,
          "vk-terminal-scroll mt-auto border-t border-fd-border px-5 py-[18px] text-fd-muted-foreground",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function WrittenLine({
  line,
  labels,
}: {
  line: GateLine;
  labels: Record<string, string>;
}): ReactNode {
  const isNew = line.annotation === "new";
  return (
    <div
      className={cn(
        "flex items-start gap-4 whitespace-pre",
        isNew && "-mx-5 px-[17px] pe-5 text-fd-foreground",
      )}
      style={isNew ? HIGHLIGHT_STYLE : undefined}
    >
      <code className="min-w-0 flex-1">{line.text}</code>
      {line.annotation ? (
        <span
          className="shrink-0 font-sans text-sm"
          style={{ color: isNew ? "var(--accent)" : "var(--text-faint)" }}
        >
          {labels[line.annotation]}
        </span>
      ) : null}
    </div>
  );
}

export async function Proof(): Promise<ReactNode> {
  const t = await getTranslations("landing.proof");
  const tInstall = await getTranslations("landing.install");
  const tHow = await getTranslations("landing.how");
  const tGate = await getTranslations("landing.gate");
  const tTerminal = await getTranslations("landing.terminal");

  const annotations = { new: tGate("annotations.new"), kept: tGate("annotations.kept") };
  const refusalRows = [
    [tGate("rows.key"), GATE_REFUSAL.key],
    [tGate("rows.candidate"), GATE_REFUSAL.candidate],
    [tGate("rows.missing"), GATE_REFUSAL.missing],
    [tGate("rows.reason"), GATE_REFUSAL.reason],
    [tGate("rows.kept"), GATE_REFUSAL.kept],
  ] as const;

  return (
    <Section width="wide" rhythm="lg" id="how">
      <div>
        <SectionHead title={tHow("heading")} />
      </div>
      <div
        className="mt-[52px] grid grid-cols-[minmax(0,1fr)] gap-px overflow-hidden rounded-xl border border-fd-border lg:grid-cols-3"
        style={{ background: "var(--border-default)" }}
      >
        <div className="min-w-0 lg:col-span-3">
          <Terminal
            commands={[GATE_CLI_COMMAND]}
            outputs={GATE_OUTPUTS}
            title={GATE_CLI_COMMAND}
            sessionLabel={tTerminal("sessionLabel")}
            loop={false}
            typingSpeed={32}
            initialDelay={350}
            highlight={GATE_RUN_LINES[2]}
            fitContent
            className="h-full rounded-none border-0"
            headerAction={
              <CopyButton
                text={GATE_CLI_COMMAND}
                label={tInstall("copyCommand", { command: GATE_CLI_COMMAND })}
              />
            }
          />
        </div>
        <Region title={t("written.title")} body={t("written.body")}>
          <div className="min-w-max">
            {GATE_TARGET_LINES.map((line) => (
              <WrittenLine key={line.text} line={line} labels={annotations} />
            ))}
          </div>
        </Region>
        <Region title={t("refused.title")} body={t("refused.body")}>
          <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3">
            {refusalRows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-[color:var(--text-faint)]">{label}</dt>
                <dd
                  className={cn(
                    "m-0 whitespace-pre-wrap break-words",
                    value === GATE_REFUSAL.missing && "text-[color:var(--text-danger)]",
                  )}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </Region>
        <Region title={t("lock.title")} body={t("lock.body")}>
          <div className="text-[color:var(--text-faint)]">{GATE_LOCK_FILE}</div>
          <pre className="whitespace-pre">
            {GATE_LOCK_LINES.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </pre>
        </Region>
      </div>
      <div>
        <ol className="mt-5 grid list-none gap-4 md:grid-cols-4">
          {STEP_KEYS.map((key, index) => (
            <li key={key} className="border-t border-fd-border pt-[18px]">
              <h3 className="vk-h4">
                <span style={{ color: "var(--accent)" }}>{index + 1}. </span>
                {tHow(`steps.${key}.title`)}
              </h3>
              <p className="mt-1.5 text-sm text-fd-muted-foreground">{tHow(`steps.${key}.body`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
