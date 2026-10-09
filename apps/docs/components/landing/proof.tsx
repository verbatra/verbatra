import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { GATE_CLI_COMMAND, GATE_REFUSAL_LINE, GATE_RUN_LINES } from "@/lib/gate-demo";
import { HOW_STEP_KEYS } from "@/lib/landing-sections";
import { Section } from "./section";
import { SectionHead } from "./section-head";
import { Terminal } from "./terminal";

const GATE_OUTPUTS = { 0: GATE_RUN_LINES } as const;

export async function Proof(): Promise<ReactNode> {
  const tInstall = await getTranslations("landing.install");
  const tHow = await getTranslations("landing.how");
  const tTerminal = await getTranslations("landing.terminal");

  return (
    <Section width="wide" rhythm="md" id="how">
      <div>
        <SectionHead title={tHow("heading")} />
      </div>
      <div className="mt-[52px] min-w-0">
        <Terminal
          commands={[GATE_CLI_COMMAND]}
          outputs={GATE_OUTPUTS}
          title={GATE_CLI_COMMAND}
          sessionLabel={tTerminal("sessionLabel")}
          loop={false}
          typingSpeed={32}
          initialDelay={350}
          highlight={GATE_REFUSAL_LINE}
          fitContent
          wrap
          headerAction={
            <CopyButton
              text={GATE_CLI_COMMAND}
              label={tInstall("copyCommand", { command: GATE_CLI_COMMAND })}
            />
          }
        />
      </div>
      <div>
        <ol className="mt-5 grid list-none grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4">
          {HOW_STEP_KEYS.map((key, index) => (
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
