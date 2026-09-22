import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  GATE_CLI_COMMAND,
  GATE_LOCK_FILE,
  GATE_LOCK_LINES,
  GATE_REFUSAL,
  GATE_TARGET_LINES,
  type GateLine,
} from "@/lib/gate-demo";
import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";
import { Section } from "./section";
import { SectionHead } from "./section-head";
import { Terminal } from "./terminal";

const MONO = "font-mono text-[13.5px] leading-[1.75]";

const HIGHLIGHT_STYLE = {
  background: "color-mix(in srgb, var(--v-purple) 22%, transparent)",
  borderInlineStart: "3px solid var(--v-purple)",
} as const;

const STEP_KEYS = ["configure", "diff", "translate", "verifyWrite"] as const;

function Panel({
  order,
  title,
  body,
  className,
  children,
}: {
  order: number;
  title: string;
  body: string;
  className?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <Reveal
      order={order}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-xl border border-fd-border",
        className,
      )}
      style={{ background: "var(--surface-bg)" }}
    >
      <div className="px-6 pt-[22px] pb-[18px]">
        <h3
          className="font-semibold text-fd-foreground"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.2rem",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h3>
        <p className="mt-1.5 max-w-[48ch] text-sm text-fd-muted-foreground">{body}</p>
      </div>
      <div
        className={cn(
          MONO,
          "mt-auto overflow-x-auto border-t border-fd-border px-5 py-[18px] text-fd-muted-foreground",
        )}
        style={{ background: "var(--v-void)" }}
      >
        {children}
      </div>
    </Reveal>
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
          className="shrink-0 font-sans text-[13px]"
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
  const tHow = await getTranslations("landing.how");
  const tGate = await getTranslations("landing.gate");
  const tTerminal = await getTranslations("landing.terminal");

  const runLines = Object.values(tTerminal.raw("transcript.run") as Record<string, string>);
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
      <Reveal>
        <SectionHead title={tHow("heading")} />
      </Reveal>
      <div className="mt-[52px] grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-12">
        <Reveal order={0} className="min-w-0 lg:col-span-8">
          <Terminal
            commands={[GATE_CLI_COMMAND]}
            outputs={{ 0: runLines }}
            title="~/acme-shop"
            sessionLabel={tTerminal("sessionLabel")}
            loop={false}
            typingSpeed={32}
            initialDelay={350}
            highlight={runLines[0]}
            fitContent
            className="h-full"
            headerAction={
              <CopyButton
                text={GATE_CLI_COMMAND}
                label={t("copyCommand", { command: GATE_CLI_COMMAND })}
              />
            }
          />
        </Reveal>
        <Panel order={1} title={t("lock.title")} body={t("lock.body")} className="lg:col-span-4">
          <div className="text-[color:var(--text-faint)]">{GATE_LOCK_FILE}</div>
          <pre className="whitespace-pre">
            {GATE_LOCK_LINES.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </pre>
        </Panel>
        <Panel
          order={2}
          title={t("written.title")}
          body={t("written.body")}
          className="lg:col-span-7"
        >
          <div className="min-w-max">
            {GATE_TARGET_LINES.map((line) => (
              <WrittenLine key={line.text} line={line} labels={annotations} />
            ))}
          </div>
        </Panel>
        <Panel
          order={3}
          title={t("refused.title")}
          body={t("refused.body")}
          className="lg:col-span-5"
        >
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
        </Panel>
      </div>
      <Reveal order={4}>
        <ol className="mt-5 grid list-none gap-4 md:grid-cols-4">
          {STEP_KEYS.map((key, index) => (
            <li key={key} className="border-t border-fd-border pt-[18px]">
              <h3
                className="font-semibold text-fd-foreground"
                style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem" }}
              >
                <span style={{ color: "var(--accent)" }}>{index + 1}. </span>
                {tHow(`steps.${key}.title`)}
              </h3>
              <p className="mt-1.5 text-sm text-fd-muted-foreground">{tHow(`steps.${key}.body`)}</p>
            </li>
          ))}
        </ol>
      </Reveal>
    </Section>
  );
}
